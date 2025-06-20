// bvh_build.wgsl

struct Node {
    min:   vec3<f32>,
    max:   vec3<f32>,
    left:  u32,
    right: u32,
    start: u32,
    count: u32,
};

@group(0) @binding(0) var<storage, read>         triBuf:   array<vec3<f32>>;
@group(0) @binding(1) var<storage, read_write>   nodeBuf:  array<Node>;
@group(0) @binding(2) var<uniform>               nodeCount: u32;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= nodeCount) {
        return;
    }

    // read the node by index
    let n = nodeBuf[idx];

    if (n.count > 0u) {
        var mn = vec3<f32>( 1e6,  1e6,  1e6);
        var mx = vec3<f32>(-1e6, -1e6, -1e6);
        for (var i = 0u; i < n.count; i = i + 1u) {
            let b  = n.start + i;
            let t0 = triBuf[3u * b + 0u];
            let t1 = triBuf[3u * b + 1u];
            let t2 = triBuf[3u * b + 2u];
            mn = min(mn, min(t0, min(t1, t2)));
            mx = max(mx, max(t0, max(t1, t2)));
        }
        nodeBuf[idx].min = mn;
        nodeBuf[idx].max = mx;
    } else {
        let leftNode  = nodeBuf[n.left];
        let rightNode = nodeBuf[n.right];
        nodeBuf[idx].min = min(leftNode.min, rightNode.min);
        nodeBuf[idx].max = max(leftNode.max, rightNode.max);
    }
}
