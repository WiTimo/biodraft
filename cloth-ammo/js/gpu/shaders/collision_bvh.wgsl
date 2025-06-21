// File: js/gpu/shaders/collision_bvh.wgsl

struct Node {
  min   : vec3<f32>,
  max   : vec3<f32>,
  left  : u32,
  right : u32,
  start : u32,
  count : u32,
};

@group(0) @binding(0) var<storage, read> triBuf   : array<vec3<f32>>;
@group(0) @binding(1) var<storage, read> nodeBuf  : array<Node>;

@group(1) @binding(0) var<storage, read_write> vertexPos   : array<vec3<f32>>;
@group(1) @binding(1) var<uniform>             vertexCount : u32;

// AABB vs point
fn aabbOverlap(minB: vec3<f32>, maxB: vec3<f32>, p: vec3<f32>) -> bool {
  return all(p >= minB) && all(p <= maxB);
}

// Project point p onto the plane of triangle (a,b,c)
fn closestPointOnTrianglePlane(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>)
    -> vec3<f32> {
  let n = normalize(cross(b - a, c - a));
  let d = dot(p - a, n);
  return p - d * n;
}

// Traverse the BVH, and for every leaf triangle always project p onto its plane
fn traverseBVH(orig: vec3<f32>) -> vec3<f32> {
  var stack: array<u32, 32>;
  var sp:   i32 = 0;
  stack[0] = 0u;
  var p = orig;

  loop {
    if (sp < 0) { break; }
    let idx = stack[u32(sp)];
    sp = sp - 1;
    let n = nodeBuf[idx];

    // only descend nodes whose AABB overlaps p
    if (!aabbOverlap(n.min, n.max, p)) {
      continue;
    }

    if (n.count > 0u) {
      // leaf: for each triangle, project p
      for (var i = 0u; i < n.count; i = i + 1u) {
        let bIdx = n.start + i;
        let t0   = triBuf[3u*bIdx + 0u];
        let t1   = triBuf[3u*bIdx + 1u];
        let t2   = triBuf[3u*bIdx + 2u];
        p = closestPointOnTrianglePlane(p, t0, t1, t2);
      }
    } else {
      // internal: push children
      sp = sp + 1; stack[u32(sp)] = n.left;
      sp = sp + 1; stack[u32(sp)] = n.right;
    }
  }

  return p;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= vertexCount) { return; }
  let pos  = vertexPos[idx];
  let newP = traverseBVH(pos);
  vertexPos[idx] = newP;
}
