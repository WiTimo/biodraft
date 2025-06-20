// js/init/clothBuilder.js

import * as THREE from 'three';
import * as Compute from '../compute/index.js';
import { attribute } from 'three/tsl';

export function buildCloth(globalIdx, verletVertices, seamDebugPairs, params) {
  // cloth geometry
  const geom = new THREE.BufferGeometry();
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(globalIdx), 1));

  // positions
  const posArr = new Float32Array(verletVertices.length * 3);
  verletVertices.forEach((v, i) => {
    posArr[i * 3]     = v.position.x;
    posArr[i * 3 + 1] = v.position.y;
    posArr[i * 3 + 2] = v.position.z;
  });
  geom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));

  // vertexId (for pulling back from the compute buffer)
  const vid = new Uint32Array(verletVertices.length).map((_, i) => i);
  geom.setAttribute('vertexId', new THREE.BufferAttribute(vid, 1));

  // ensure we have normals for lighting
  geom.computeVertexNormals();

  // cloth material
  const clothMaterial = new THREE.MeshPhysicalNodeMaterial({
    color:     0x204080,
    side:      THREE.DoubleSide,
    roughness: 1,
    metalness: 0.3
  });
  clothMaterial.positionNode =
    Compute.vertexPositionBuffer.element(attribute('vertexId'));

  const clothMesh = new THREE.Mesh(geom, clothMaterial);
  clothMesh.frustumCulled = false;

  // seam‐debug lines
  const lineGeo = new THREE.BufferGeometry();
  const arr = new Float32Array(seamDebugPairs.length * 6);
  seamDebugPairs.forEach(([i0, i1], k) => {
    const p0 = verletVertices[i0].position;
    const p1 = verletVertices[i1].position;
    arr.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], k * 6);
  });
  lineGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(arr, 3).setUsage(THREE.DynamicDrawUsage)
  );
  const seamLines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({ color: 0xff0000 })
  );

  return { clothMesh, seamLines };
}
