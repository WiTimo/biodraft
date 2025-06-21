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
  let tAccum = 0, timestamp = 0;

  renderer.setAnimationLoop(async () => {
    const dt   = Math.min(clock.getDelta(), 1/60);
    tAccum    += dt;
    const step = 1/300;

    while (tAccum >= step) {
      tAccum    -= step;
      timestamp += step;

      // 1) Refit mesh BVH on GPU
      dispatchBVH(device, nodeCount);

      // 2) Update uniforms
      Compute.windUniform.value          = params.wind;
      Compute.stiffnessUniform.value     = params.stiffness;
      Compute.seamTightnessUniform.value = Math.min(timestamp * 2, 1);
      Compute.sphereRadiusUniform.value  = params.sphereRadius;

      // 3) Cloth sim
      await renderer.computeAsync(Compute.computeSpringForces);
      await renderer.computeAsync(Compute.computeVertexForces);

      // 4) GPU collision
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
