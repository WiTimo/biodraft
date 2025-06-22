// File: js/init/modelLoader.js

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries as mergeBufferGeometries }
  from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Load man.glb, merge all meshes, scale it,
 * and return a Float32Array of [x,y,z, x,y,z, …].
 */
export async function loadModelTriData() {
  const gltf = await new GLTFLoader().loadAsync('./models/man.glb');
  const geoms = [];
  gltf.scene.traverse(o => {
    if (o.isMesh) {
      const g = o.geometry;
      geoms.push(g.index ? g.toNonIndexed() : g.clone());
    }
  });
  if (geoms.length === 0) throw new Error('No meshes found in man.glb');

  // Merge, scale to 10%
  const merged = mergeBufferGeometries(geoms, false);
  merged.scale(0.1, 0.1, 0.1);

  // Pull out the raw positions
  const posAttr = merged.getAttribute('position');
  return new Float32Array(posAttr.array);
}
