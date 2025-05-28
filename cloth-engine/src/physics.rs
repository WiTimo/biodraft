use crate::{PatternData, PointData};
use delaunator::{triangulate, Point as DPoint};
use nalgebra::{Point2, Vector2};
use std::collections::{HashMap, HashSet};

/// PhysicsWorld mit PBD‐Verlet, Constraint‐Solve und NaN-Sanitizing
pub struct PhysicsWorld {
    masses: Vec<Mass>,
    springs: Vec<Spring>,
    gravity: f64,
    damping: f64,
    solve_iters: usize,
    max_dt: f64,
}

#[derive(Debug)]
pub struct Mass {
    pub id: String,
    pub pos: Point2<f64>,
    pub prev_pos: Point2<f64>,
    pub inv_mass: f64, // =0 → gepinnt
}

struct Spring {
    i1: usize,
    i2: usize,
    rest_len: f64,
}

impl PhysicsWorld {
    pub fn new(data: &PatternData) -> Self {
        // ─── 1) Erstelle Rand-Massen ────────────────────────────────
        let mut masses = Vec::new();
        let mut id_to_index = HashMap::new();
        for path in &data.paths {
            for pt in &path.points {
                let idx = masses.len();
                id_to_index.insert(pt.id.clone(), idx);
                masses.push(Mass {
                    id: pt.id.clone(),
                    pos: Point2::new(pt.x, pt.y),
                    prev_pos: Point2::new(pt.x, pt.y),
                    inv_mass: 1.0,
                });
            }
        }

        // ─── 2) Delaunay-Triangulation ──────────────────────────────
        let dela_pts: Vec<DPoint> = masses
            .iter()
            .map(|m| DPoint { x: m.pos.x, y: m.pos.y })
            .collect();
        let mesh = triangulate(&dela_pts).expect("Triangulation fehlgeschlagen");

        // ─── 3) Extrahiere einzigartige Kanten ──────────────────────
        let mut edges = HashSet::new();
        for tri in mesh.triangles.chunks(3) {
            let (a, b, c) = (tri[0], tri[1], tri[2]);
            for &(u, v) in &[(a, b), (b, c), (c, a)] {
                let e = if u < v { (u, v) } else { (v, u) };
                edges.insert(e);
            }
        }

        // ─── 4) Baue Strukturfedern ─────────────────────────────────
        let mut springs = Vec::new();
        for &(i, j) in &edges {
            let rest = (masses[i].pos - masses[j].pos).norm();
            springs.push(Spring { i1: i, i2: j, rest_len: rest });
        }

        // ─── 5) Biegefedern (2-Hop-Nachbarn) ────────────────────────
        let mut adj = vec![Vec::new(); masses.len()];
        for &(i, j) in &edges {
            adj[i].push(j);
            adj[j].push(i);
        }
        for i in 0..masses.len() {
            for &n1 in &adj[i] {
                for &n2 in &adj[n1] {
                    if n2 != i && !adj[i].contains(&n2) {
                        let e = if i < n2 { (i, n2) } else { (n2, i) };
                        if !edges.contains(&e) {
                            let rest = (masses[e.0].pos - masses[e.1].pos).norm();
                            springs.push(Spring { i1: e.0, i2: e.1, rest_len: rest });
                        }
                    }
                }
            }
        }

        // ─── 6) Pinne obere Kante ──────────────────────────────────
        let min_y = masses.iter().map(|m| m.pos.y).fold(f64::INFINITY, f64::min);
        let eps = 1e-3;
        for m in &mut masses {
            if (m.pos.y - min_y).abs() < eps {
                m.inv_mass = 0.0;
            }
        }

        PhysicsWorld {
            masses,
            springs,
            gravity:     1000.0,
            damping:     0.02,
            solve_iters: 10,
            max_dt:      0.016,
        }
    }

    /// Verlet + Constraint-Solve + Sanitize
    pub fn step(&mut self, dt: f64) {
        // ▶ dt-Clamping ◀
        let dt = dt.min(self.max_dt).max(0.0);
        let dt2 = dt * dt;
        let gravity_vec = Vector2::new(0.0, self.gravity);

        // 1) Verlet
        for m in &mut self.masses {
            if m.inv_mass == 0.0 { continue; }
            let vel = m.pos - m.prev_pos;
            let new_pos = m.pos + vel * (1.0 - self.damping) + gravity_vec * dt2;
            m.prev_pos = m.pos;
            m.pos = new_pos;
        }

        // 2) Constraint-Solve (gewichtete Federprojektion)
        for _ in 0..self.solve_iters {
            for sp in &self.springs {
                let i = sp.i1;
                let j = sp.i2;
                let p_i = self.masses[i].pos;
                let p_j = self.masses[j].pos;
                let delta = p_j - p_i;
                let dist = delta.norm().max(1e-6);
                let diff = (dist - sp.rest_len) / dist;
                let w_i = self.masses[i].inv_mass;
                let w_j = self.masses[j].inv_mass;
                let wsum = w_i + w_j;
                if wsum == 0.0 { continue; }
                let corr = delta * diff;
                self.masses[i].pos += -corr * (w_i / wsum);
                self.masses[j].pos +=  corr * (w_j / wsum);
            }
        }

        // 3) Sanitize: Keine NaN-Werte weiterreichen
        for m in &mut self.masses {
            if !m.pos.x.is_finite() || !m.pos.y.is_finite() {
                // Rückfall auf letzte gültige Position
                m.pos = m.prev_pos;
            }
        }
    }

    /// Für JS: Massen-Positionen
    pub fn export_positions(&self) -> Vec<PointData> {
        self.masses.iter().map(|m| PointData {
            id:        m.id.clone(),
            x:         m.pos.x,
            y:         m.pos.y,
            handleIn:  None,
            handleOut: None,
        }).collect()
    }
}

/// Even-Odd-Punkt-im-Polygon-Test
fn point_in_poly(pt: (f64, f64), poly: &[(f64, f64)]) -> bool {
    let (x, y) = pt;
    let mut inside = false;
    for i in 0..poly.len() {
        let (xi, yi) = poly[i];
        let (xj, yj) = poly[(i + 1) % poly.len()];
        if ((yi > y) != (yj > y)) &&
           (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
        {
            inside = !inside;
        }
    }
    inside
}
