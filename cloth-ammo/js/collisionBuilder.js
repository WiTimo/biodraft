// File: js/gpu/collisionBuilder.js

export let sphereCollisionPipeline = null;
export let sphereBG0              = null;
export let sphereBG1              = null;

// Debug + uniform buffers
export let debugBuffer    = null;
export let triCountBuffer = null;

/**
 * Compile the naive sphere‐vs‐triangles WGSL, set up both bind groups:
 *  · group0: triBuf
 *  · group1: spherePos, sphereData, triCount, debugBuf
 */
export async function initSphereCollisionPipeline(
  device,
  triangleVertexBuffer,
  triangleCount,
  sphereBuffers,    // { position: GPUBufferBinding }
  sphereDataBuffer  // GPUBuffer (uniform vec4<f32> where x=radius)
) {
  const code = await fetch('./js/gpu/shaders/sphere_collision.wgsl').then(r => r.text());
  sphereCollisionPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code }), entryPoint: 'main' }
  });

  // group0: triangles
  sphereBG0 = device.createBindGroup({
    layout: sphereCollisionPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: triangleVertexBuffer } }]
  });

  // triCount uniform (pad to 16 bytes)
  triCountBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(triCountBuffer, 0, new Uint32Array([ triangleCount ]));

  // debugBuffer = 8 floats = 32 bytes
  debugBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
  });

  // group1: spherePos, sphereData, triCount, debugBuf
  const layout1 = sphereCollisionPipeline.getBindGroupLayout(1);
  sphereBG1 = device.createBindGroup({
    layout: layout1,
    entries: [
      { binding: 0, resource: sphereBuffers.position },
      { binding: 1, resource: { buffer: sphereDataBuffer } },
      { binding: 2, resource: { buffer: triCountBuffer } },
      { binding: 3, resource: { buffer: debugBuffer } }
    ]
  });

  // **Return the buffers so callers can destructure them**
  return { debugBuffer, triCountBuffer };
}

/**
 * Dispatch the sphere↔mesh pass (single workgroup).
 */
export function dispatchSphereCollision(device) {
  if (!sphereCollisionPipeline) throw new Error('Not initialized');
  const enc  = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(sphereCollisionPipeline);
  pass.setBindGroup(0, sphereBG0);
  pass.setBindGroup(1, sphereBG1);
  pass.dispatchWorkgroups(1);
  pass.end();
  device.queue.submit([enc.finish()]);
}
