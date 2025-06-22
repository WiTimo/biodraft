// File: js/loop.js

import * as THREE from 'three';
import { dispatchSphereCollision, debugBuffer } from './gpu/collisionBuilder.js';

export function startLoop(
  renderer,
  device,
  scene,
  camera,
  sphereMesh,
  sphereVel,
  spherePosBinding
) {
  const clock = new THREE.Clock();
  let frame = 0;

  renderer.setAnimationLoop(async () => {
    const dt = Math.min(clock.getDelta(), 1/60);

    // -- CPU gravity on sphere --
    sphereVel.addScaledVector(new THREE.Vector3(0, -9.8, 0), dt);
    sphereMesh.position.addScaledVector(sphereVel, dt);

    // **DEBUG** log the current sphere center going into the GPU:
    console.log('🔍 Loop frame', frame, 'spherePos =', sphereMesh.position.toArray());

    // -- upload sphere center --
    device.queue.writeBuffer(
      spherePosBinding.buffer,
      spherePosBinding.offset,
      new Float32Array([
        sphereMesh.position.x,
        sphereMesh.position.y,
        sphereMesh.position.z,
        0
      ])
    );

    // -- run GPU collision --
    dispatchSphereCollision(device);

    frame++;
    if (frame % 60 === 0) {
      // **DEBUG** read back the raw debugBuffer so you can inspect all 8 floats
      const readB = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      });
      const enc = device.createCommandEncoder();
      enc.copyBufferToBuffer(debugBuffer, 0, readB, 0, 32);
      device.queue.submit([enc.finish()]);
      await readB.mapAsync(GPUMapMode.READ);
      const raw = new Float32Array(readB.getMappedRange());
      readB.unmap();
      console.log('🔍 debugBuf contents:', raw);
    }

    await renderer.renderAsync(scene, camera);
  });
}

export function onWindowResize(camera, renderer) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
