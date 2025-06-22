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
  vertexCount,
  bvhVis
) {
  const clock = new THREE.Clock();
  let tAccum = 0;

  // Slower substep so cloth moves visibly
  const step = 1 / 100;

  renderer.setAnimationLoop(async () => {
    const dt = Math.min(clock.getDelta(), 1/60);
    tAccum += dt;

    if (tAccum >= step) {
      tAccum -= step;

      // 1) Refit mesh BVH on GPU
      dispatchBVH(device, nodeCount);

      // 2) Update uniforms
      Compute.windUniform.value          = params.wind;
      Compute.stiffnessUniform.value     = params.stiffness;
      Compute.seamTightnessUniform.value = Math.min(clock.elapsedTime * 2, 1);
      Compute.sphereRadiusUniform.value  = params.sphereRadius;

      // 3) Collision pass
      dispatchCollision(device, vertexCount);

      // 4) Copy collided positions back into the TSL position buffer
      const src = Compute.vertexPositionBuffer.buffer;               // sharedPosBuffer
      const dst = Compute.vertexPositionBuffer.value.buffer;         // TSL’s internal buffer
      const size = vertexCount * 3 * 4; // bytes = count * vec3<f32> * sizeof(f32)
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(src, 0, dst, 0, size);
      device.queue.submit([encoder.finish()]);

      // 5) Cloth sim: spring forces + Verlet integration
      await renderer.computeAsync(Compute.computeSpringForces);
      await renderer.computeAsync(Compute.computeVertexForces);
    }

    // 6) BVH visualizer update
    if (bvhVis) bvhVis.update();

    clothMesh.material.wireframe = params.showWireframe;
    await renderer.renderAsync(scene, camera);
  });
}

export function onWindowResize(camera, renderer) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
