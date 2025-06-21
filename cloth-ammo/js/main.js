// File: js/main.js

import { init }           from './init/index.js';
import { startLoop,
         onWindowResize } from './loop.js';

(async function(){
  const {
    renderer,
    device,
    scene,
    camera,
    clothMesh,
    seamLines,
    params,
    nodeCount,
    vertexCount
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
    params,
    nodeCount,
    vertexCount
  );
})();
