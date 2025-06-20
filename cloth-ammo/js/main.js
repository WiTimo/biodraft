// js/main.js

import { init } from './init/index.js';
import { startLoop, onWindowResize } from './loop.js';

(async function(){
  const {
    renderer,
    device,
    scene,
    camera,
    clothMesh,
    seamLines,
    meshWorldPositions,
    params,
    nodeCount    // ← now passed through from init()
  } = await init();

  window.addEventListener('resize', () =>
    onWindowResize(camera, renderer)
  );

  startLoop(
    renderer,
    device,
    scene,
    camera,
    clothMesh,
    seamLines,
    meshWorldPositions,
    params,
    nodeCount     // ← supply it here
  );
})();
