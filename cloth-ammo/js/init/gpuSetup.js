// File: js/init/gpuSetup.js

import * as Compute              from '../compute/index.js';
import { initBVHPipeline }       from '../gpu/bvhBuilder.js';
import { initCollisionPipeline } from '../gpu/collisionBuilder.js';
import { createBVHBuffers }      from './bvhBuffers.js';

export async function setupGPU(
  renderer,
  device,
  verletVertices,
  verletSprings,
  seamDebugPairs,
  params,
  triData,
  nodeData
) {
  console.log("🔧 setupGPU(): creating TSL compute buffers");
  Compute.setupBuffers(verletVertices, verletSprings, seamDebugPairs);
  Compute.setupUniforms(params);
  Compute.setupComputeShaders(verletVertices, verletSprings);

  console.log("🔧 setupGPU(): uploading BVH buffers");
  const { triangleVertexBuffer, bvhNodeBuffer, nodeCount } =
    createBVHBuffers(device, triData, nodeData);
  console.log("  • triangleVertexBuffer:", triangleVertexBuffer);
  console.log("  • bvhNodeBuffer:",       bvhNodeBuffer);
  console.log("  • nodeCount:",           nodeCount);
  await initBVHPipeline(device, triangleVertexBuffer, bvhNodeBuffer, nodeCount);
  console.log("✅ BVH pipeline initialized");

  console.log("🔧 setupGPU(): creating cloth-vertex count buffer");
  const countBuf = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(countBuf, 0, new Uint32Array([verletVertices.length]));
  console.log("  • countBuf:", countBuf);

  console.log("🔧 setupGPU(): running warm-up computeAsync()");
  await renderer.computeAsync(Compute.computeSpringForces);
  await renderer.computeAsync(Compute.computeVertexForces);

  // Allocate & upload a single shared GPUBuffer for cloth positions
  const arrayBuf = await renderer.getArrayBufferAsync(
    Compute.vertexPositionBuffer.value
  );
  const posArray = new Float32Array(arrayBuf);
  const sharedPosBuffer = device.createBuffer({
    size: posArray.byteLength,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC
  });
  device.queue.writeBuffer(sharedPosBuffer, 0, posArray);
  console.log("  • sharedPosBuffer:", sharedPosBuffer);

  // Point TSL at it so sim writes here, and material reads here
  Compute.vertexPositionBuffer.buffer       = sharedPosBuffer;
  Compute.vertexPositionBuffer.value.buffer = sharedPosBuffer;

  console.log("🔧 setupGPU(): initializing collision pipeline");
  await initCollisionPipeline(
    device,
    triangleVertexBuffer,
    bvhNodeBuffer,
    {
      positionBuffer: { buffer: sharedPosBuffer },
      countBuffer:    countBuf
    }
  );
  console.log("✅ collision pipeline initialized");

  return nodeCount;
}
