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

  // 2) Make the geometry 10% of its original size
  const geom = mesh.geometry.index
    ? mesh.geometry.toNonIndexed()
    : mesh.geometry;
  geom.scale(0.1, 0.1, 0.1);
  mesh.geometry = geom;

  // 3) Add a BoxHelper to visualize the collision bounds
  const box = new THREE.BoxHelper(mesh, 0xff0000);
  scene.add(box);

  // 4) Add the (now scaled) mesh to the scene
  scene.add(mesh);

  // 5) Build the BVH eagerly (so boundsTree is populated)
  geom.computeBoundsTree({ lazyGeneration: false });
  const bvh = geom.boundsTree;
  if (!bvh) throw new Error('BVH build failed');

  // 6) Extract flat triangle positions
  const posAttr = geom.getAttribute('position');
  const triData = new Float32Array(posAttr.array);

  // 7) Traverse the BVH to collect each node
  const allNodes = [];
  bvh.traverse((_, __, node) => {
    allNodes.push(node);
  });
  console.log('Flattened BVH raw nodes:', allNodes.length);

  // 8) Build WGSL‐friendly nodeData with empty bounds (GPU will fill them)
  const nodeData = allNodes.map(node => ({
    min:   [0, 0, 0],
    max:   [0, 0, 0],
    left:  typeof node.left   === 'number' ? node.left   : 0,
    right: typeof node.right  === 'number' ? node.right  : 0,
    start: typeof node.offset === 'number' ? node.offset : 0,
    count: typeof node.count  === 'number' ? node.count  : 0
  }));
  console.log('Final nodeData count:', nodeData.length);

  return { triData, nodeData };
}
