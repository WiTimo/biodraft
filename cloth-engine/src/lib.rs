use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

// ─── Structs ───────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct Handle {
    dx: f64,
    dy: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SeamEndpoint {
    path_id: String,
    start: usize,
    end: usize,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Seam {
    from: SeamEndpoint,
    to: SeamEndpoint,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PointData {
    id: String,
    x: f64,
    y: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    handleIn: Option<Handle>,
    #[serde(skip_serializing_if = "Option::is_none")]
    handleOut: Option<Handle>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PathData {
    id: String,
    points: Vec<PointData>,
    closed: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PatternData {
    paths: Vec<PathData>,
    seams: Vec<Seam>, 
}

#[derive(Serialize, Deserialize)]
pub struct ResolvedSeam {
    from_points: Vec<PointData>,
    to_points: Vec<PointData>,
}

// ─── WASM Bindings ─────────────────────────────────────────────────────────

#[wasm_bindgen]
pub struct PatternEngine {
    stored_json: Option<PatternData>,
}

#[wasm_bindgen]
impl PatternEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { stored_json: None }
    }

    #[wasm_bindgen]
    pub fn load_json(&mut self, json_str: &str) -> Result<(), JsValue> {
        let parsed: PatternData = serde_json::from_str(json_str)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse JSON: {}", e)))?;

        self.stored_json = Some(parsed);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_json(&self) -> Result<JsValue, JsValue> {
        match &self.stored_json {
            Some(data) => JsValue::from_serde(data)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e))),
            None => Err(JsValue::from_str("No pattern loaded")),
        }
    }

    #[wasm_bindgen]
    pub fn get_resolved_seams_json(&self) -> Result<JsValue, JsValue> {
        let Some(data) = &self.stored_json else {
            return Err(JsValue::from_str("No pattern loaded"));
        };

        // Map paths by ID for quick lookup
        let path_map: HashMap<_, _> = data.paths.iter().map(|p| (&p.id, p)).collect();

        let mut resolved: Vec<ResolvedSeam> = Vec::new();

        for seam in &data.seams {
            let from_path = match path_map.get(&seam.from.path_id) {
                Some(path) => path,
                None => continue,
            };

            let to_path = match path_map.get(&seam.to.path_id) {
                Some(path) => path,
                None => continue,
            };

            let from_start = seam.from.start;
            let from_end = seam.from.end;
            let to_start = seam.to.start;
            let to_end = seam.to.end;

            if from_start >= from_path.points.len() || from_end >= from_path.points.len() {
                continue;
            }
            if to_start >= to_path.points.len() || to_end >= to_path.points.len() {
                continue;
            }

            let from_slice = if from_start <= from_end {
                from_path.points[from_start..=from_end].to_vec()
            } else {
                from_path.points[from_end..=from_start].iter().rev().cloned().collect()
            };

            let to_slice = if to_start <= to_end {
                to_path.points[to_start..=to_end].to_vec()
            } else {
                to_path.points[to_end..=to_start].iter().rev().cloned().collect()
            };

            resolved.push(ResolvedSeam {
                from_points: from_slice,
                to_points: to_slice,
            });
        }

        JsValue::from_serde(&resolved)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }
}
