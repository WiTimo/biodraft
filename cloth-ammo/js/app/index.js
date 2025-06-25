// js/app/index.js
import { loadConfig, patternData } from '../config.js';
import { setupClothData }        from './setupClothData.js';
import { setupCompute }          from './setupCompute.js';
import { buildMesh }             from './buildMesh.js';
import { setupScene }            from './setupScene.js';
import { setupGUI }              from './setupGUI.js';
import { animate }               from './animate.js';
import { GLTFLoader }            from 'three/addons/loaders/GLTFLoader.js';
import { setupMeshBuffers }      from './setupMeshCollision.js';

export async function init() {
  await loadConfig();
  if (!patternData || patternData.patterns.length !== 2) {
    console.error('Need exactly two patterns');
    return;
  }

  // — Load your skinned character —
  const loader = new GLTFLoader();
  const gltf   = await loader.loadAsync('../../models/man.glb');
  // find the first SkinnedMesh in the scene
  const skinnedMesh = gltf.scene.getObjectByProperty('isSkinnedMesh', true);
  if (!skinnedMesh) {
    console.error('No SkinnedMesh found in man.glb');
    return;
  }

  // — [1] build raw cloth data —
  const clothData = setupClothData(patternData);

  // — [2] wire up GPU compute (including mesh buffers) —
  setupCompute({ ...clothData, skinnedMesh });

  // — [3] build cloth mesh + seams —
  const { clothMesh, seamLines } = buildMesh(clothData);

  // — [4] set up scene (now also adds your character) —
  const { renderer, scene, camera, sphere } =
    setupScene({ clothMesh, seamLines, skinnedMesh });

  // — [5] GUI controls —
  setupGUI();

  // — [6] start loop —
  animate({
    renderer,
    scene,
    camera,
    clothMesh,
    seamLines,
    sphere,
    skinnedMesh,
    verletVertices: clothData.verletVertices,
    seamDebugPairs: clothData.seamDebugPairs
  });

  // — [7] resize handling —
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
