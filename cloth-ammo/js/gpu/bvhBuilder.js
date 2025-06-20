/**
 * initBVHPipeline(device, triangleVertexBuffer, bvhNodeBuffer, nodeCount)
 *   – compiles the WGSL, creates the bindGroup with our two buffers + a uniform count.
 * dispatchBVH(device, nodeCount)
 *   – runs the compute‐pass to refit the BVH each frame/substep.
 */

let bvhBuildPipeline = null;
let bvhBindGroup     = null;

export async function initBVHPipeline(
  device,
  triangleVertexBuffer,
  bvhNodeBuffer,
  nodeCount
) {
  // 1) Fetch the WGSL at runtime
  const resp = await fetch('./js/gpu/shaders/bvh_build.wgsl');
  const code = await resp.text();

  // 2) Create compute pipeline (now with an explicit layout)
  bvhBuildPipeline = device.createComputePipeline({
    layout: 'auto',      // ← ensure automatic layout generation
    compute: {
      module: device.createShaderModule({ code }),
      entryPoint: 'main'
    }
  });

  // 3) Uniform buffer for nodeCount
  const nodeCountBuf = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(nodeCountBuf, 0, new Uint32Array([ nodeCount ]));

  // 4) BindGroup: triBuf @0, nodeBuf @1, count @2
  bvhBindGroup = device.createBindGroup({
    layout: bvhBuildPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: triangleVertexBuffer } },
      { binding: 1, resource: { buffer: bvhNodeBuffer         } },
      { binding: 2, resource: { buffer: nodeCountBuf          } }
    ]
  });
}

export function dispatchBVH(device, nodeCount) {
  const encoder = device.createCommandEncoder();
  const pass    = encoder.beginComputePass();
  pass.setPipeline(bvhBuildPipeline);
  pass.setBindGroup(0, bvhBindGroup);
  pass.dispatchWorkgroups(nodeCount);
  pass.end();
  device.queue.submit([ encoder.finish() ]);
}
