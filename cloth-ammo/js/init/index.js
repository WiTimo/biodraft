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

  // 1) Load + verify pattern data
  await loadConfig();
  if (!patternData || patternData.patterns.length !== 2) {
    console.error('❌ Need exactly two patterns');
    return;
  }
  console.log("✅ patternData loaded:", patternData);

  // 2) Sample & merge pattern halves
  const { halves, ids0, boundarySegments, initialClothHeight, separationY } =
    samplePatterns(patternData);
  console.log("✅ Patterns sampled:", halves);
  const { Apts, Bpts, globalIdx } = mergeHalves(halves);
  console.log("✅ Patterns merged → globalIdx length:", globalIdx.length);

  // 3) Build Verlet spring–mass data
  const { verletVertices, verletSprings, addSpring } =
    buildVerlet(Apts, Bpts, initialClothHeight, separationY, globalIdx);
  console.log("✅ Verlet data →", verletVertices.length, "vertices,", verletSprings.length, "springs");

  // 4) Sew seams
  const seamDebugPairs = buildSeams(
    patternData.seams, halves, ids0, Apts.length, addSpring
  );
  console.log("✅ seamDebugPairs count:", seamDebugPairs.length);

  // 5) Initialize renderer & device
  console.log("🔧 init(): initializing renderer & device");
  const { renderer, device } = await initRenderer();
  console.log("Renderer:", renderer);
  console.log("Device:", device);
  if (!device) {
    console.error('❌ WebGPU device not available on renderer!');
  }

  // 6) Build placeholder scene
  const dummyMesh  = new THREE.Object3D();
  const dummyLines = new THREE.Object3D();
  const params     = { showWireframe: true, wind: 0, stiffness: 0.5, sphereRadius: 0.15 };
  const { scene, camera, controls } =
    initScene(renderer, dummyMesh, dummyLines, params);

  // 7) Load CPU BVH from GLTF
  console.log("🔧 init(): loading and building CPU BVH");
  const { triData, nodeData } = await loadModelBVH(scene);
  console.log("✅ CPU BVH ready → triangles:", triData.length / 3, "nodes:", nodeData.length);

  // 8) GPU setup: cloth sim + BVH + collision
  console.log("🔧 init(): delegating to setupGPU()");
  const { nodeCount, clothPositionGPUBuffer } = await setupGPU(
    renderer, device,
    verletVertices, verletSprings, seamDebugPairs,
    params, triData, nodeData
  );
  console.log("✅ setupGPU() complete → nodeCount:", nodeCount);

  // 9) Build the visible cloth + seams now that GPU is ready
  console.log("🔧 init(): building cloth & seam meshes for render");
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
    clothPositionGPUBuffer
  };
}
