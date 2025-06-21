// File: js/init/modelLoader.js

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

// Install BVH helpers onto BufferGeometry
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

/**
 * Load man.glb, build a CPU BVH, and return:
 *   - triData:  Float32Array of all triangle positions
 *   - nodeData: Array of { min:[x,y,z], max:[x,y,z], left, right, start, count }
 */
export async function loadModelBVH(scene) {
  // 1) Load the GLTF and find its first mesh
  const gltf = await new GLTFLoader().loadAsync('./models/man.glb');
  let mesh = null;
  gltf.scene.traverse(o => {
    if (o.isMesh && !mesh) mesh = o;
  });
  if (!mesh) throw new Error('No mesh found in man.glb');
  scene.add(mesh);

  // 2) Ensure non-indexed geometry so triangles are in order
  const geom = mesh.geometry.index
    ? mesh.geometry.toNonIndexed()
    : mesh.geometry;

  // 3) Build the BVH eagerly (so boundsTree is populated)
  geom.computeBoundsTree({ lazyGeneration: false });
  const bvh = geom.boundsTree;
  if (!bvh) throw new Error('BVH build failed');

  // 4) Extract flat triangle positions
  const posAttr = geom.getAttribute('position');
  const triData = new Float32Array(posAttr.array);

  // 5) Traverse the BVH to collect each node
  const allNodes = [];
  // Note: in three-mesh-bvh v0.9.0, traverse(callback) provides
  // (boundsArray, offset, count) so the 3rd arg is the MeshBVHNode.
  bvh.traverse((_, __, node) => {
    allNodes.push(node);
  });
  console.log('Flattened BVH raw nodes:', allNodes.length);

  // 6) Build WGSL‐friendly nodeData, zeroing min/max (GPU will recompute them)
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
