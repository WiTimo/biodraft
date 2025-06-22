// File: js/main.js

import { init } from './init/index.js';
import { startLoop } from './loop.js';

(async function() {
  const {
    renderer,
    device,
    scene,
    camera,
    sphereMesh,
    sphereVel,
    spherePosBinding,
    params
  } = await init();

  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Kick off the animation loop
  startLoop(
    renderer,
    device,
    scene,
    camera,
    sphereMesh,
    sphereVel,
    spherePosBinding,
    params
  );
})();
