use serde::{Serialize, Deserialize};
use crate::{PatternData, PointData, SeamEndpoint};

#[derive(Debug)]
pub struct Mass {
    /// 2D position
    pub x: f64,
    pub y: f64,
    /// 2D velocity
    pub vx: f64,
    pub vy: f64,
}

#[derive(Debug)]
pub struct Spring {
    pub a: usize,
    pub b: usize,
    pub rest_len: f64,
    pub k: f64,
}

/// Simple world holding masses and springs
pub struct PhysicsWorld {
    pub masses: Vec<Mass>,
    pub springs: Vec<Spring>,
    /// damping (friction)
    pub damping: f64,
    pub pinned: Vec<bool>,
}

impl PhysicsWorld {
    /// Build from your PatternData: 
    /// – one Mass per PointData  
    /// – a Spring for each adjacent‐point pair in each path  
    /// – a Spring for each seam (from→to)
    pub fn new(data: &PatternData) -> Self {
        // copy all points into masses
        let mut masses = Vec::new();
        let mut index_map = std::collections::HashMap::new();
        for path in &data.paths {
            for (i, pt) in path.points.iter().enumerate() {
                let idx = masses.len();
                index_map.insert(pt.id.clone(), idx);
                masses.push(Mass { x: pt.x, y: pt.y, vx: 0.0, vy: 0.0 });
            }
        }

        // mark the first and last point of each path as pinned
        let mut pinned = vec![false; masses.len()];
        for path in &data.paths {
            if let Some(first) = path.points.first() {
                pinned[index_map[&first.id]] = true;
            }
            if let Some(last) = path.points.last() {
                pinned[index_map[&last.id]] = true;
            }
        }

        let mut springs = Vec::new();
        let stiffness = 50.0;

        // path‐springs: each adjacent segment
        for path in &data.paths {
            for w in path.points.windows(2) {
                let a = index_map[&w[0].id];
                let b = index_map[&w[1].id];
                let dx = w[1].x - w[0].x;
                let dy = w[1].y - w[0].y;
                let rest = (dx*dx + dy*dy).sqrt();
                springs.push(Spring { a, b, rest_len: rest, k: stiffness });
            }
            // if closed, connect last→first
            if path.closed && path.points.len() >= 2 {
                let first = &path.points[0];
                let last  = path.points.last().unwrap();
                let a = index_map[&last.id];
                let b = index_map[&first.id];
                let dx = first.x - last.x;
                let dy = first.y - last.y;
                let rest = (dx*dx + dy*dy).sqrt();
                springs.push(Spring { a, b, rest_len: rest, k: stiffness });
            }
        }

        // seam‐springs
        for seam in &data.seams {
            let a0 = &seam.from;
            let b0 = &seam.to;
            // map our endpoints to indices
            let ia = index_map[&data.paths.iter()
                .find(|p| p.id == a0.path_id).unwrap()
                .points[a0.start].id];
            let ib = index_map[&data.paths.iter()
                .find(|p| p.id == b0.path_id).unwrap()
                .points[b0.start].id];
            // initial rest‐length from start points
            let dx = masses[ib].x - masses[ia].x;
            let dy = masses[ib].y - masses[ia].y;
            let rest = (dx*dx + dy*dy).sqrt();
            // start‐point spring
            springs.push(Spring { a: ia, b: ib, rest_len: rest, k: stiffness });
            // end‐point spring
            let ia2 = index_map[&data.paths.iter()
                .find(|p| p.id == seam.from.path_id).unwrap()
                .points[seam.from.end].id];
            let ib2 = index_map[&data.paths.iter()
                .find(|p| p.id == seam.to.path_id).unwrap()
                .points[seam.to.end].id];
            let dx2 = masses[ib2].x - masses[ia2].x;
            let dy2 = masses[ib2].y - masses[ia2].y;
            let rest2 = (dx2*dx2 + dy2*dy2).sqrt();
            springs.push(Spring { a: ia2, b: ib2, rest_len: rest2, k: stiffness });
        }

        PhysicsWorld {
            masses,
            springs,
            damping: 0.98,
            pinned,
        }
    }

    /// Single Euler integration step
    pub fn step(&mut self, dt: f64) {
        let n = self.masses.len();
        // accumulate forces
        let mut fx = vec![0.0; n];
        let mut fy = vec![0.0; n];

        for spring in &self.springs {
            let ma = &self.masses[spring.a];
            let mb = &self.masses[spring.b];
            let dx = mb.x - ma.x;
            let dy = mb.y - ma.y;
            let dist = (dx*dx + dy*dy).sqrt().max(1e-6);
            let diff = dist - spring.rest_len;
            // F = -k * x
            let f = spring.k * diff;
            let ux = dx / dist;
            let uy = dy / dist;
            fx[spring.a] +=  f * ux;
            fy[spring.a] +=  f * uy;
            fx[spring.b] += -f * ux;
            fy[spring.b] += -f * uy;
        }

        // update velocities & positions
        for (i, m) in self.masses.iter_mut().enumerate() {
            let ax = fx[i];
            let ay = fy[i];
            m.vx = (m.vx + ax * dt) * self.damping;
            m.vy = (m.vy + ay * dt) * self.damping;
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            if self.pinned[i] {
                // skip moving pinned masses
                m.vx = 0.0;
                m.vy = 0.0;
            } else {
                let ax = fx[i];
                let ay = fy[i];
                m.vx = (m.vx + ax * dt) * self.damping;
                m.vy = (m.vy + ay * dt) * self.damping;
                m.x  += m.vx * dt;
                m.y  += m.vy * dt;
            }
        }
    }

    /// Export positions for JS as Vec<PointData>
    pub fn export_positions(&self, data: &PatternData) -> Vec<PointData> {
        let mut out = Vec::with_capacity(self.masses.len());
        for path in &data.paths {
            for pt in &path.points {
                let idx = (0usize, 0usize); // placeholder
                // look up our index_map logic again, or store IDs with masses
                // for brevity, assume you carry the pt.id alongside its mass in a paired Vec
                // but here we simply rebuild:
                let mass_idx = data.paths.iter().flat_map(|p| p.points.iter())
                    .position(|p2| p2.id == pt.id).unwrap();
                let m = &self.masses[mass_idx];
                out.push(PointData {
                    id: pt.id.clone(),
                    x: m.x,
                    y: m.y,
                    handleIn: None,
                    handleOut: None,
                });
            }
        }
        out
    }
}
