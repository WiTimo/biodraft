// File: js/init/gpuSetup.js

import * as Compute from '../compute/index.js';
import { initSphereCollisionPipeline } from '../gpu/collisionBuilder.js';

/**
 * Set up the “naive” sphere-vs-all-triangles collision on the GPU,
 * with debug logs for triData and buffer bindings.
 */
export async function setupGPU(renderer, device, params, triData) {
  // Debug: show triData
  console.log('🔍 setupGPU: triData.length =', triData.length);
  console.log('🔍 setupGPU: triData.slice(0, 9) =', triData.slice(0, 9));

  // Upload triangle buffer as array<vec3<f32>>
  const triangleVertexBuffer = device.createBuffer({
    size: triData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(triangleVertexBuffer, 0, triData);

  // Compute triangle count (9 floats per triangle)
  const triangleCount = triData.length / 9;
  console.log('🔍 setupGPU: triangleCount =', triangleCount);

  // Sphere position buffer (padded vec3 -> vec4)
  const spherePosArr = new Float32Array([
    params.spherePosition.x,
    params.spherePosition.y,
    params.spherePosition.z,
    0
  ]);
  const spherePosBuffer = device.createBuffer({
    size: spherePosArr.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
  });
  device.queue.writeBuffer(spherePosBuffer, 0, spherePosArr);
  const spherePosBinding = {
    buffer: spherePosBuffer,
    offset: 0,
    size:   spherePosArr.byteLength
  };
  console.log('🔍 setupGPU: spherePosBinding =', spherePosBinding);

  // Sphere-data uniform buffer
  const sphereDataBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(
    sphereDataBuf,
    0,
    new Float32Array([ params.sphereRadius, 0, 0, 0 ])
  );
  console.log('🔍 setupGPU: sphereDataBuf =', sphereDataBuf);

  // Initialize sphere collision pipeline and get debug buffers
  const { debugBuffer, triCountBuffer } = await initSphereCollisionPipeline(
    device,
    triangleVertexBuffer,
    triangleCount,
    { position: spherePosBinding },
    sphereDataBuf
  );
  console.log('🔍 setupGPU: debugBuffer =', debugBuffer);
  console.log('🔍 setupGPU: triCountBuffer =', triCountBuffer);

  return { spherePosBinding };
}
