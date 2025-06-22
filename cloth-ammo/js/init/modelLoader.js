import MeshBVHVisualizer
  from 'https://unpkg.com/three-mesh-bvh@0.4.0/src/MeshBVHVisualizer.js';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries as mergeBufferGeometries } from 'https://unpkg.com/three@0.177.0/examples/jsm/utils/BufferGeometryUtils.js';

export async function loadModelBVH(scene) {
  // 1) Load the GLTF
  const gltf = await new GLTFLoader().loadAsync('./models/man.glb');

  // 2) Collect & non-index each mesh’s geometry
  const geoms = [];
  gltf.scene.traverse(o => {
    if (o.isMesh) {
      const g = o.geometry;
      geoms.push(g.index ? g.toNonIndexed() : g.clone());
    }
  });
  if (geoms.length === 0) throw new Error('No meshes found in man.glb');

  // 3) Merge into one big BufferGeometry
  const merged = mergeBufferGeometries(geoms, false);

  // 4) Scale down to 10%
  merged.scale(0.1, 0.1, 0.1);

  // 5) Create a mesh and add it
  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: false })
  );
  scene.add(mesh);

  // 6) Build a deep BVH: split leaves at 10 tris max
  const bvh = new MeshBVH(merged, { lazyGeneration: false, maxLeafTris: 10 });
  merged.boundsTree = bvh;

  // 7) Visualize it
  const bvhVis = new MeshBVHVisualizer(mesh, /* maxDepth=*/ 10);
  scene.add(bvhVis);

  // 8) Extract triangle data for GPU
  const posAttr = merged.getAttribute('position');
  const triData = new Float32Array(posAttr.array);

  // 9) **Flatten BVH nodes** — use the simpler single-arg traverse
  const all = [];
  bvh.traverse(node => {
    all.push(node);
  });
  console.log('Flattened BVH raw nodes:', all.length);

  const nodeData = all.map(n => ({
    min:   [0,0,0],
    max:   [0,0,0],
    left:  typeof n.left   === 'number' ? n.left   : 0,
    right: typeof n.right  === 'number' ? n.right  : 0,
    start: typeof n.offset === 'number' ? n.offset : 0,
    count: typeof n.count  === 'number' ? n.count  : 0
  }));

  return { triData, nodeData, bvhVis };
}
