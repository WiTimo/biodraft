let bvhBuildPipeline  = null;
let bvhBuildBindGroup = null;
let bvhBuildEmptyBG   = null;

/**
 * Compile the BVH-build WGSL and set up bind group 0.
 */
export async function initBVHPipeline(
  device,
  triangleVertexBuffer,
  bvhNodeBuffer,
  nodeCount
) {
  // 1) Fetch the WGSL at runtime
  const resp = await fetch('./js/gpu/shaders/bvh_build.wgsl');
  const code = await resp.text();

  // 2) Create compute pipeline with automatic layout
  bvhBuildPipeline = device.createComputePipeline({
    layout: 'auto',
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

  // 4) Bind group 0: triBuf @0, nodeBuf @1, count @2
  bvhBuildBindGroup = device.createBindGroup({
    layout: bvhBuildPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: triangleVertexBuffer } },
      { binding: 1, resource: { buffer: bvhNodeBuffer         } },
      { binding: 2, resource: { buffer: nodeCountBuf          } }
    ]
  });

  // 5) Prepare an “empty” bind group for index 1 (if declared)
  try {
    const layout1 = bvhBuildPipeline.getBindGroupLayout(1);
    bvhBuildEmptyBG = device.createBindGroup({
      layout:  layout1,
      entries: []
    });
  } catch {
    bvhBuildEmptyBG = null;
  }
}

/**
 * Dispatch the BVH-build pass.
 */
export function dispatchBVH(device, nodeCount) {
  const encoder = device.createCommandEncoder();
  const pass    = encoder.beginComputePass();

  pass.setPipeline(bvhBuildPipeline);
  pass.setBindGroup(0, bvhBuildBindGroup);

  if (bvhBuildEmptyBG) {
    pass.setBindGroup(1, bvhBuildEmptyBG);
  }

  // clamp & coerce nodeCount to a GPUSize32 (unsigned 32-bit integer)
  const wgCount = Math.floor(Number(nodeCount));
  if (!Number.isInteger(wgCount) || wgCount < 0) {
    console.warn('dispatchBVH got invalid nodeCount:', nodeCount);
  }
  // clamp to [0, 2^32-1]
  const dispatchCount = Math.min(Math.max(wgCount, 0), 0xFFFFFFFF);

  pass.dispatchWorkgroups(dispatchCount);

  pass.end();
  device.queue.submit([ encoder.finish() ]);
}
