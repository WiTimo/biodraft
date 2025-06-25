// js/app/setupMeshCollision.js
import * as THREE               from 'three';
import { instancedArray, uniform } from 'three/tsl';
import * as Compute             from '../compute/index.js';

//
// Called once in setupCompute(): allocate your triangle‐index buffer
// and the dynamic skinned‐position buffer.
//
export function setupMeshBuffers(skinnedMesh) {
  const geo         = skinnedMesh.geometry;
  const idxAttr     = geo.index;
  const posAttr     = geo.getAttribute('position');
  const vertexCount = posAttr.count;
  const triCount    = idxAttr.count / 3;

  // — STATIC triangle‐index buffer —
  // Flatten Uint16/32Array indices into uvec3 triplets
  const flatIdx = new Uint32Array(triCount * 3);
  flatIdx.set(idxAttr.array);
  Compute.triIndexBuffer  = instancedArray(flatIdx, 'uvec3').setPBO(true);
  Compute.triCountUniform = uniform(triCount);

  // — DYNAMIC skinned‐position buffer (will be updated each frame) —
  Compute.skinnedPosBuffer = instancedArray(
    new Float32Array(vertexCount * 3),
    'vec3'
  ).setPBO(true);

  // Keep the mesh around for our CPU‐skin pass
  Compute._skinnedMesh = skinnedMesh;
}

//
// Called each frame *on the CPU* to skin all vertices
// (we'll move this into a GPU pass later). Then we re‐upload.
//
export function captureSkinnedPositions() {
  const mesh      = Compute._skinnedMesh;
  const geo       = mesh.geometry;
  const posAttr   = geo.getAttribute('position');
  const skinIdx   = geo.getAttribute('skinIndex');
  const skinWgt   = geo.getAttribute('skinWeight');
  const bones     = mesh.skeleton.bones;
  const arr       = Compute.skinnedPosBuffer.array; // Float32Array
  const v         = new THREE.Vector3();
  const sk        = new THREE.Vector3();
  const tmp       = new THREE.Vector3();

  mesh.updateMatrixWorld(true);

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    sk.set(0, 0, 0);
    // up to 4‐bone influences (Three.js default)
    for (let j = 0; j < 4; j++) {
      const bi = skinIdx.getX(i * 4 + j);
      const w  = skinWgt.getX(i * 4 + j);
      if (w > 0) {
        tmp.copy(v)
           .applyMatrix4(bones[bi].matrixWorld)
           .multiplyScalar(w);
        sk.add(tmp);
      }
    }
    arr[3 * i + 0] = sk.x;
    arr[3 * i + 1] = sk.y;
    arr[3 * i + 2] = sk.z;
  }

  // tell Three.js to re‐upload this PBO
  Compute.skinnedPosBuffer.needsUpdate = true;
}
