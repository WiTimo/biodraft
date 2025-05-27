use crate::{PatternData, PointData};
use nalgebra::{Point2, Vector2};

/// Sehr einfacher PhysicsWorld: nur Gravitation, kein Pinning mehr
pub struct PhysicsWorld {
    pub masses: Vec<Mass>,
}

#[derive(Debug)]
pub struct Mass {
    pub id: String,
    pub pos: Point2<f64>,
    pub vel: Vector2<f64>,
    // pub pinned: bool, // entfällt fürs Basis-Beispiel
}

impl PhysicsWorld {
    /// Knoten aus PatternData erzeugen, ohne Pinning
    pub fn new(data: &PatternData) -> Self {
        let mut masses = Vec::new();
        for path in &data.paths {
            for pt in &path.points {
                masses.push(Mass {
                    id:    pt.id.clone(),
                    pos:   Point2::new(pt.x, pt.y),
                    vel:   Vector2::zeros(),
                });
            }
        }
        PhysicsWorld { masses }
    }

    /// Schritt: Gravitation anwenden (y → Editor-koord positiv nach unten)
    pub fn step(&mut self, dt: f64) {
        // stärkere „Pixel‐Gravitation“, sichtbar im Canvas
        let gravity = 1000.0;

        for m in &mut self.masses {
            // Geschwindigkeit in y‐Richtung (positiv nach unten)
            m.vel.y += gravity * dt;
            // Position updaten
            m.pos.x += m.vel.x * dt;
            m.pos.y += m.vel.y * dt;
        }
    }

    /// Gibt die aktuellen Positionen zurück für JS
    pub fn export_positions(&self) -> Vec<PointData> {
        self.masses
            .iter()
            .map(|m| PointData {
                id:        m.id.clone(),
                x:         m.pos.x,
                y:         m.pos.y,
                handleIn:  None,
                handleOut: None,
            })
            .collect()
    }
}
