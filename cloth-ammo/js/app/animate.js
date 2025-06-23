// js/app/animate.js

import * as THREE     from 'three';
import * as Compute   from '../compute/index.js';
import { params }     from './config.js';

export function animate({
  renderer,
  scene,
  camera,
  clothMesh,
  seamLines,
  sphere,
  verletVertices,
  seamDebugPairs
}) {
  const clock           = new THREE.Clock();
  let timeSinceLastStep = 0;
  let timestamp         = 0;

  renderer.setAnimationLoop(async () => {
    const dt = Math.min(clock.getDelta(), 1/60);
    timeSinceLastStep += dt;
    const tStep = 1/300;
    while (timeSinceLastStep >= tStep) {
      timeSinceLastStep -= tStep;
      timestamp       += tStep;

      // animate sphere & update compute uniforms
      sphere.position.set(
        Math.sin(timestamp * 2.1) * 0.1,
        0,
        Math.sin(timestamp * 0.8) * 0.1
      );
      Compute.spherePositionUniform.value.copy(sphere.position);
      Compute.windUniform.value       = params.wind;
      Compute.stiffnessUniform.value  = params.stiffness;
      Compute.seamTightnessUniform.value =
        Math.min(timestamp * 2.0, 1.0);

      await renderer.computeAsync(Compute.computeSpringForces);
      await renderer.computeAsync(Compute.computeVertexForces);
    }

    // refresh seam‐line positions
    const attr = seamLines.geometry.attributes.position;
    const arr  = attr.array;
    seamDebugPairs.forEach(([i0,i1], k) => {
      const off = k * 6;
      const p0  = verletVertices[i0].position;
      const p1  = verletVertices[i1].position;
      arr[off+0] = p0.x; arr[off+1] = p0.y; arr[off+2] = p0.z;
      arr[off+3] = p1.x; arr[off+4] = p1.y; arr[off+5] = p1.z;
    });
    attr.needsUpdate = true;
    // apply GUI toggles
    clothMesh.material.wireframe = params.showWireframe;
    sphere.visible               = params.showSphere;

    await renderer.renderAsync(scene, camera);
  });
}
