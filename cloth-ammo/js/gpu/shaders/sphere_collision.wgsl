// File: js/gpu/shaders/sphere_collision.wgsl

// Triangles buffer (vec3<f32> triplets)
@group(0) @binding(0) var<storage, read> triBuf    : array<vec3<f32>>;

// Sphere position & data
@group(1) @binding(0) var<storage, read_write> spherePos  : array<vec3<f32>>;
@group(1) @binding(1) var<uniform>             sphereData : vec4<f32>;

// Number of triangles
@group(1) @binding(2) var<uniform>             triCount   : u32;

// Debug buffer (we allocate 8 floats = 32 bytes)
@group(1) @binding(3) var<storage, read_write> debugBuf   : array<f32>;

// Ericson’s closest‐point on tri
fn closestPointOnTriangle(
    p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>
) -> vec3<f32> {
  let ab = b - a;
  let ac = c - a;
  let ap = p - a;
  let d1 = dot(ab, ap);
  let d2 = dot(ac, ap);
  if (d1 <= 0.0 && d2 <= 0.0) { return a; }
  let bp = p - b;
  let d3 = dot(ab, bp);
  let d4 = dot(ac, bp);
  if (d3 >= 0.0 && d4 <= d3) { return b; }
  let vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) {
    let v = d1 / (d1 - d3);
    return a + ab * v;
  }
  let cp = p - c;
  let d5 = dot(ab, cp);
  let d6 = dot(ac, cp);
  if (d6 >= 0.0 && d5 <= d6) { return c; }
  let vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) {
    let w = d2 / (d2 - d6);
    return a + ac * w;
  }
  let va = d3 * d6 - d5 * d4;
  if (va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0) {
    let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return b + (c - b) * w;
  }
  let denom = 1.0 / (va + vb + vc);
  let v = vb * denom;
  let w = vc * denom;
  return a + ab * v + ac * w;
}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  // Only compute at index 0
  let orig   = spherePos[0];
  var bestP  = orig;
  var bestD2: f32 = 1e20;

  // Test every triangle
  for (var t: u32 = 0u; t < triCount; t = t + 1u) {
    let base = t * 3u;
    let a = triBuf[base + 0u];
    let b = triBuf[base + 1u];
    let c = triBuf[base + 2u];
    let cp = closestPointOnTriangle(orig, a, b, c);
    let d2 = dot(cp - orig, cp - orig);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestP  = cp;
    }
  }

  // Push sphere out if intersecting
  let r = sphereData.x;
  if (bestD2 < r * r) {
    let dist = sqrt(bestD2);
    let n    = (bestP - orig) / dist;
    spherePos[0] = bestP + n * r;
  }

  // Write debug:
  // [0]=bestD2, [1..3]=bestP.xyz, [4..6]=orig.xyz, [7]=unused
  debugBuf[0] = bestD2;
  debugBuf[1] = bestP.x;
  debugBuf[2] = bestP.y;
  debugBuf[3] = bestP.z;
  debugBuf[4] = orig.x;
  debugBuf[5] = orig.y;
  debugBuf[6] = orig.z;
  debugBuf[7] = 0.0;
}
