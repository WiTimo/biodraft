// collision_bvh.wgsl

struct Node {
    min:   vec3<f32>,
    max:   vec3<f32>,
    left:  u32,
    right: u32,
    start: u32,
    count: u32,
};

@group(0) @binding(0) var<storage, read>      triBuf:  array<vec3<f32>>;
@group(0) @binding(1) var<storage, read>      nodeBuf: array<Node>;

fn aabbOverlap(minB: vec3<f32>, maxB: vec3<f32>, p: vec3<f32>) -> bool {
    return all(p >= minB) && all(p <= maxB);
}

fn closestPointOnTriangle(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>) -> vec4<f32> {
    // (stub — your real implementation goes here)
    return vec4<f32>(p, 1.0);
}

fn traverseBVH(orig: vec3<f32>) -> vec3<f32> {
    var stack: array<u32, 32>;
    var sp:    i32 = 0;
    stack[0] = 0u;

    var p = orig;

    loop {
        if (sp < 0) {
            break;
        }
        let idx = stack[u32(sp)];
        sp = sp - 1;

        let n = nodeBuf[idx];
        if (!aabbOverlap(n.min, n.max, p)) {
            continue;
        }

        if (n.count > 0u) {
            for (var i = 0u; i < n.count; i = i + 1u) {
                let b     = n.start + i;
                let t0    = triBuf[3u * b + 0u];
                let t1    = triBuf[3u * b + 1u];
                let t2    = triBuf[3u * b + 2u];
                let res   = closestPointOnTriangle(p, t0, t1, t2);
                if (res.w < 0.0) {
                    p = res.xyz;
                }
            }
        } else {
            sp = sp + 1; stack[u32(sp)] = n.left;
            sp = sp + 1; stack[u32(sp)] = n.right;
        }
    }

    return p;
}
