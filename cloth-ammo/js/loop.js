// js/loop.js

import * as THREE from 'three';
import * as Compute from './compute/index.js';
import { dispatchBVH } from './gpu/bvhBuilder.js';

/**
 * Starts the animation loop, rebuilding the BVH and then running cloth steps.
 *
 * @param {THREE.WebGPURenderer} renderer
 * @param {GPUDevice}           device
 * @param {THREE.Scene}         scene
 * @param {THREE.Camera}        camera
 * @param {THREE.Mesh}          clothMesh
 * @param {THREE.LineSegments}  seamLines
 * @param {Float32Array|null}   meshWorldPositions
 * @param {Object}              params
 * @param {number}              nodeCount  – number of BVH nodes from setupGPU
 */
export function startLoop(
  renderer,
  device,
  scene,
  camera,
  clothMesh,
  seamLines,
  meshWorldPositions,
  params,
  nodeCount
) {
  const clock = new THREE.Clock();
  let timeSinceLastStep = 0,
      timestamp         = 0;

  renderer.setAnimationLoop(async () => {
    const dt = Math.min(clock.getDelta(), 1/60);
    timeSinceLastStep += dt;
    const tStep = 1/300;

    while (timeSinceLastStep >= tStep) {
      timeSinceLastStep -= tStep;
      timestamp += tStep;

      // Refit the BVH on the GPU
      dispatchBVH(device, nodeCount);

      // Update cloth uniforms
      Compute.windUniform.value          = params.wind;
      Compute.stiffnessUniform.value     = params.stiffness;
      Compute.seamTightnessUniform.value = Math.min(timestamp * 2, 1);
      Compute.sphereRadiusUniform.value  = params.sphereRadius;

      // Cloth integration
      await renderer.computeAsync(Compute.computeSpringForces);
      await renderer.computeAsync(Compute.computeVertexForces);
      if (meshWorldPositions) {
        await renderer.computeAsync(Compute.computeCollision);
      }
    }

    clothMesh.material.wireframe = params.showWireframe;
    await renderer.renderAsync(scene, camera);
  });
}

/**
 * Window resize handler.
 */
export function onWindowResize(camera, renderer) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
