// File: js/init/index.js

import * as THREE                   from 'three';
import { loadConfig, patternData }  from '../config.js';
import { samplePatterns }           from './patternSampler.js';
import { mergeHalves }              from './patternMerger.js';
import { buildVerlet }              from './verletBuilder.js';
import { buildSeams }               from './seamBuilder.js';
import { initRenderer, initScene }  from './sceneSetup.js';
import { buildCloth }               from './clothBuilder.js';
import { loadModelBVH }             from './modelLoader.js';
import { setupGPU }                 from './gpuSetup.js';

export async function init() {
  console.log("🔧 init(): starting initialization");

  // 1) Patterns
  await loadConfig();
  if (!patternData || patternData.patterns.length !== 2) {
    console.error('❌ Need exactly two patterns');
    return;
  }

  // 2) Sample & merge
  let {
    halves,
    ids0,
    boundarySegments,
    initialClothHeight,
    separationY
  } = samplePatterns(patternData);

  // start the cloth at a reasonable height above the model
  initialClothHeight = 1.0;

  const { Apts, Bpts, globalIdx } = mergeHalves(halves);

  // 3) Verlet data
  const { verletVertices, verletSprings, addSpring } =
    buildVerlet(Apts, Bpts, initialClothHeight, separationY, globalIdx);

  // 4) Seams
  const seamDebugPairs = buildSeams(
    patternData.seams, halves, ids0, Apts.length, addSpring
  );

  // 5) Renderer & device
  const { renderer, device } = await initRenderer();

  // 6) Scene & camera
  const dummyMesh  = new THREE.Object3D();
  const dummyLines = new THREE.Object3D();
  const params     = {
    showWireframe: true,
    wind: 0,
    stiffness: 0.5,
    sphereRadius: 0.15
  };
  const { scene, camera, controls } =
    initScene(renderer, dummyMesh, dummyLines, params);

  // 7) Load & scale CPU BVH
  const { triData, nodeData, bvhVis } = await loadModelBVH(scene);
  console.log('🔍 CPU BVH node count:', nodeData.length);

  // 8) GPU setup
  const nodeCount = await setupGPU(
    renderer, device,
    verletVertices, verletSprings, seamDebugPairs,
    params, triData, nodeData
  );

  // 9) Build cloth + seams
  const { clothMesh, seamLines } =
    buildCloth(globalIdx, verletVertices, seamDebugPairs, params);
  scene.add(clothMesh, seamLines);

  return {
    renderer,
    device,
    scene,
    camera,
    controls,
    clothMesh,
    seamLines,
    params,
    nodeCount,
    vertexCount: verletVertices.length,
    bvhVis
  };
}
