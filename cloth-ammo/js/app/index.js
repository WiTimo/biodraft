// js/app/index.js

import { loadConfig, patternData } from '../config.js';
import { setupClothData }        from './setupClothData.js';
import { setupCompute }          from './setupCompute.js';
import { buildMesh }             from './buildMesh.js';
import { setupScene }            from './setupScene.js';
import { setupGUI }              from './setupGUI.js';
import { animate }               from './animate.js';

export async function init() {
  await loadConfig();
  if (!patternData || patternData.patterns.length !== 2) {
    console.error('Need exactly two patterns');
    return;
  }

  // [1] build raw cloth data
  const clothData = setupClothData(patternData);

  // [2] wire up GPU compute
  setupCompute(clothData);

  // [3] build mesh + seam‐lines
  const { clothMesh, seamLines } = buildMesh(clothData);

  // [4] scene, camera, lights, sphere
  const { renderer, scene, camera, sphere } =
    setupScene({ clothMesh, seamLines });

  // [5] GUI controls
  setupGUI();

  // [6] start the render/compute loop
  animate({
    renderer,
    scene,
    camera,
    clothMesh,
    seamLines,
    sphere,
    verletVertices: clothData.verletVertices,
    seamDebugPairs: clothData.seamDebugPairs
  });

  // [7] handle resizes
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
