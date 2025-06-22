// File: js/loop.js

import * as THREE from 'three';
import * as Compute          from './compute/index.js';
import { dispatchBVH }       from './gpu/bvhBuilder.js';
import { dispatchCollision } from './gpu/collisionBuilder.js';

export function startLoop(
  renderer,
  device,
  scene,
  camera,
  clothMesh,
  seamLines,
  params,
  nodeCount,
  vertexCount
) {
  const clock = new THREE.Clock();
  let tAccum    = 0;
  let timestamp = 0;

  // original step that felt good
  const step = 1 / 300;

  renderer.setAnimationLoop(async () => {
    const dt = Math.min(clock.getDelta(), 1 / 60);
    tAccum += dt;

    while (tAccum >= step) {
      tAccum    -= step;
      timestamp += step;

      // 1) refit CPU-built BVH on GPU
      dispatchBVH(device, nodeCount);

      // 2) update your cloth uniforms
      Compute.windUniform.value          = params.wind;
      Compute.stiffnessUniform.value     = params.stiffness;
      Compute.seamTightnessUniform.value = Math.min(timestamp * 2, 1);
      Compute.sphereRadiusUniform.value  = params.sphereRadius;

      // 3) standard cloth sim
      await renderer.computeAsync(Compute.computeSpringForces);
      await renderer.computeAsync(Compute.computeVertexForces);

      // 4) project onto mesh
      dispatchCollision(device, vertexCount);

      // 5) copy the collided positions back into the TSL buffer
      // so both the next sim step and the material see them
      const src = Compute.vertexPositionBuffer.buffer;       // sharedPosBuffer
      const dst = Compute.vertexPositionBuffer.value.buffer; // TSL's internal buffer
      const size = vertexCount * 3 * 4; // bytes per vec3<f32>
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(src, 0, dst, 0, size);
      device.queue.submit([encoder.finish()]);
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
