// File: js/init/modelLoader.js

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

// Install BVH helpers onto BufferGeometry
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree  = disposeBoundsTree;

export async function loadModelBVH(scene) {
  // 1) Load the GLTF and find its first mesh
  const gltf = await new GLTFLoader().loadAsync('./models/man.glb');
  let mesh = null;
  gltf.scene.traverse(o => {
    if (o.isMesh && !mesh) mesh = o;
  });
  if (!mesh) throw new Error('No mesh found in man.glb');

  // 2) Ensure non-indexed geometry so we can modify vertex positions
  const orig = mesh.geometry;
  const geom = orig.index ? orig.toNonIndexed() : orig;

  // 3) Scale the raw positions to 10%
  geom.scale(0.1, 0.1, 0.1);
  mesh.geometry = geom;

  // 4) Visualize bounds
  const box = new THREE.BoxHelper(mesh, 0xff0000);
  scene.add(box);
  scene.add(mesh);

  // 5) Build the BVH eagerly
  geom.computeBoundsTree({ lazyGeneration: false });
  const bvh = geom.boundsTree;
  if (!bvh) throw new Error('BVH build failed');

  // 6) Extract triangle data
  const posAttr = geom.getAttribute('position');
  const triData = new Float32Array(posAttr.array);

  // 7) Collect BVH nodes
  const all = [];
  bvh.traverse((_, __, node) => all.push(node));
  console.log('Flattened BVH raw nodes:', all.length);

  // 8) Pack for WGSL (min/max zeroed—GPU will fill them)
  const nodeData = all.map(n => ({
    min:   [0,0,0],
    max:   [0,0,0],
    left:  typeof n.left   === 'number' ? n.left   : 0,
    right: typeof n.right  === 'number' ? n.right  : 0,
    start: typeof n.offset === 'number' ? n.offset : 0,
    count: typeof n.count  === 'number' ? n.count  : 0
  }));
  console.log('Final nodeData count:', nodeData.length);

  return { triData, nodeData };
}
