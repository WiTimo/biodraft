// File: js/gpu/shaders/collision_bvh.wgsl

struct Node {
  min   : vec3<f32>,
  max   : vec3<f32>,
  left  : u32,
  right : u32,
  start : u32,
  count : u32,
};

@group(0) @binding(0) var<storage, read>         triBuf      : array<vec3<f32>>;
@group(0) @binding(1) var<storage, read>         nodeBuf     : array<Node>;

@group(1) @binding(0) var<storage, read_write>   vertexPos   : array<vec3<f32>>;
@group(1) @binding(1) var<uniform>               vertexCount : u32;

// Ericson’s real‐time closest‐point on triangle
fn closestPointOnTriangle(
    p: vec3<f32>,
    a: vec3<f32>,
    b: vec3<f32>,
    c: vec3<f32>
) -> vec3<f32> {
  let ab = b - a;
  let ac = c - a;
  let ap = p - a;
  let d1 = dot(ab, ap);
  let d2 = dot(ac, ap);
  if (d1 <= 0.0 && d2 <= 0.0) {
    return a;
  }
  let bp = p - b;
  let d3 = dot(ab, bp);
  let d4 = dot(ac, bp);
  if (d3 >= 0.0 && d4 <= d3) {
    return b;
  }
  let vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) {
    let v = d1 / (d1 - d3);
    return a + v * ab;
  }
  let cp = p - c;
  let d5 = dot(ab, cp);
  let d6 = dot(ac, cp);
  if (d6 >= 0.0 && d5 <= d6) {
    return c;
  }
  let vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) {
    let w = d2 / (d2 - d6);
    return a + w * ac;
  }
  let va = d3 * d6 - d5 * d4;
  if (va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0) {
    let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return b + w * (c - b);
  }
  let denom = 1.0 / (va + vb + vc);
  let v = vb * denom;
  let w = vc * denom;
  return a + ab * v + ac * w;
}

// AABB vs point test for pruning internal nodes
fn aabbOverlap(minB: vec3<f32>, maxB: vec3<f32>, p: vec3<f32>) -> bool {
  return all(p >= minB) && all(p <= maxB);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= vertexCount) { return; }

  let orig  = vertexPos[idx];
  var bestP = orig;
  var bestD2: f32 = 1e20;

  // larger stack (64) to avoid overflow
  var stack: array<u32, 64>;
  var sp: i32 = 0;
  stack[0] = 0u;

  loop {
    if (sp < 0) { break; }
    let ni   = stack[u32(sp)];
    sp = sp - 1;
    let node = nodeBuf[ni];

    // cull only internal nodes that can't contain this point
    if (node.count == 0u) {
      if (!aabbOverlap(node.min, node.max, orig)) {
        continue;
      }
    }

    if (node.count > 0u) {
      // leaf: test every triangle
      for (var i = 0u; i < node.count; i = i + 1u) {
        let t   = node.start + i;
        let a   = triBuf[3u*t + 0u];
        let b   = triBuf[3u*t + 1u];
        let c   = triBuf[3u*t + 2u];
        let cp  = closestPointOnTriangle(orig, a, b, c);
        let d   = cp - orig;
        let d2  = dot(d, d);

        // DEBUG OPTION: force vertex 0 to snap so you can watch it
        // if (idx == 0u) {
        //   bestP = cp;
        // } else
        if (d2 < bestD2) {
          bestD2 = d2;
          bestP  = cp;
        }
      }
    } else {
      // internal: descend both children
      sp = sp + 1; stack[u32(sp)] = node.left;
      sp = sp + 1; stack[u32(sp)] = node.right;
    }
  }

  vertexPos[idx] = bestP;
}
