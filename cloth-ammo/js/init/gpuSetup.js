// js/init/gpuSetup.js

import * as Compute        from '../compute/index.js';
import { initBVHPipeline } from '../gpu/bvhBuilder.js';
import { createBVHBuffers } from './bvhBuffers.js';

/**
 * @param {GPUDevice} device
 */
export async function setupGPU(
  device,
  verletVertices,
  verletSprings,
  seamDebugPairs,
  params
) {
  // 1) Set up cloth‐sim buffers & compute shaders
  Compute.setupBuffers(verletVertices, verletSprings, seamDebugPairs);
  Compute.setupUniforms(params);
  Compute.setupComputeShaders(verletVertices, verletSprings);

  // 2) A tiny test BVH: two triangles forming a 1×1 square in XY
  const triData = new Float32Array([
    0,0,0,   1,0,0,   0,1,0,
    1,0,0,   1,1,0,   0,1,0
  ]);

  const nodeData = [
    // root: interior node covering both triangles
    { min:[0,0,0], max:[1,1,0], left:1, right:2, start:0, count:0 },
    // leaf 1: first triangle
    { min:[0,0,0], max:[1,1,0], left:0, right:0, start:0, count:1 },
    // leaf 2: second triangle
    { min:[0,0,0], max:[1,1,0], left:0, right:0, start:1, count:1 }
  ];

  // 3) Pack and upload BVH buffers
  const { triangleVertexBuffer, bvhNodeBuffer, nodeCount } =
    createBVHBuffers(device, triData, nodeData);

  // 4) Compile and bind the BVH build pipeline
  await initBVHPipeline(device, triangleVertexBuffer, bvhNodeBuffer, nodeCount);

  // 5) Return the node count so the loop can dispatch correctly
  return nodeCount;
}
