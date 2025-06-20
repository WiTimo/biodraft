// js/init/index.js

import { loadConfig, patternData } from '../config.js';
import { samplePatterns }          from './patternSampler.js';
import { mergeHalves }             from './patternMerger.js';
import { buildVerlet }             from './verletBuilder.js';
import { buildSeams }              from './seamBuilder.js';
import { initRenderer, initScene } from './sceneSetup.js';
import { buildCloth }              from './clothBuilder.js';
import { loadModelCollision }      from './modelLoader.js';
import { setupGPU }                from './gpuSetup.js';

export async function init() {
  // 1) Load and verify config
  await loadConfig();
  if (!patternData || patternData.patterns.length !== 2) {
    console.error('Need exactly two patterns');
    return;
  }

  // 2) Sample & merge
  const {
    halves,
    ids0,
    boundarySegments,
    initialClothHeight,
    separationY
  } = samplePatterns(patternData);
  const { Apts, Bpts, globalIdx } = mergeHalves(halves);

  // 3) Build Verlet data
  const {
    verletVertices,
    verletSprings,
    addSpring
  } = buildVerlet(
    Apts, Bpts,
    initialClothHeight,
    separationY,
    globalIdx
  );

  // 4) Build seam pairs
  const seamDebugPairs = buildSeams(
    patternData.seams,
    halves,
    ids0,
    Apts.length,
    addSpring
  );

  // 5) Init renderer **and** its GPU device
  const { renderer, device } = await initRenderer();
  if (!device) {
    console.error('❌ WebGPU device not available on renderer!');
  }

  // 6) GPU setup (cloth + BVH) — now returns the BVH node count
  const params = {
    showWireframe: true,
    wind:          0,
    stiffness:     0.5,
    sphereRadius:  0.15
  };
  const nodeCount = await setupGPU(
    device,
    verletVertices,
    verletSprings,
    seamDebugPairs,
    params
  );

  // 7) Build the visible meshes
  const { clothMesh, seamLines } = buildCloth(
    globalIdx,
    verletVertices,
    seamDebugPairs,
    params
  );
  const { scene, camera, controls } = initScene(
    renderer,
    clothMesh,
    seamLines,
    params
  );

  // 8) Load character for collision
  const meshWorldPositions = await loadModelCollision(scene);

  return {
    renderer,
    device,
    scene,
    camera,
    clothMesh,
    seamLines,
    meshWorldPositions,
    params,
    nodeCount      // <— include it here
  };
}
