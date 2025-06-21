// File: js/loop.js

import * as Compute          from './compute/index.js';
import { dispatchBVH }       from './gpu/bvhBuilder.js';
import { dispatchCollision } from './gpu/collisionBuilder.js';
import * as THREE            from 'three';

export function startLoop(
  renderer,
  device,
  scene,
  camera,
  clothMesh,
  seamLines,
  params,
  nodeCount,
  vertexCount,
  clothPositionGPUBuffer
) {
  const clock = new THREE.Clock();
  let tAccum = 0, timestamp = 0;

  renderer.setAnimationLoop(async () => {
    const dt   = Math.min(clock.getDelta(), 1/60);
    tAccum    += dt;
    const step = 1/300;

    while (tAccum >= step) {
      tAccum    -= step;
      timestamp += step;

      // 1) Refit full‐mesh BVH
      dispatchBVH(device, nodeCount);

      // 2) Update uniforms
      Compute.windUniform.value          = params.wind;
      Compute.stiffnessUniform.value     = params.stiffness;
      Compute.seamTightnessUniform.value = Math.min(timestamp * 2, 1);
      Compute.sphereRadiusUniform.value  = params.sphereRadius;

      // 3) Cloth sim passes
      await renderer.computeAsync(Compute.computeSpringForces);
      await renderer.computeAsync(Compute.computeVertexForces);

      // 4a) Fallback: read back the updated positions & re-upload into your GPUBuffer
      const arrayBuf = await renderer.getArrayBufferAsync(
        Compute.vertexPositionBuffer.value
      );
      device.queue.writeBuffer(
        clothPositionGPUBuffer,
        0,
        new Float32Array(arrayBuf)
      );

      // 4b) Full BVH collision against cloth on GPU
      dispatchCollision(device, vertexCount);
    }

    clothMesh.material.wireframe = params.showWireframe;
    await renderer.renderAsync(scene, camera);
  });
}


export function onWindowResize(camera, renderer) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
