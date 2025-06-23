// js/app/buildMesh.js

import * as THREE           from 'three';
import { attribute }        from 'three/tsl';
import * as Compute         from '../compute/index.js';

export function buildMesh({ verletVertices, seamDebugPairs, globalIdx }) {
  // cloth geometry
  const geom = new THREE.BufferGeometry();
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(globalIdx), 1));
  const vid = new Uint32Array(verletVertices.length).map((_,i)=>i);
  geom.setAttribute('vertexId', new THREE.BufferAttribute(vid, 1));

  const clothMaterial = new THREE.MeshPhysicalNodeMaterial({
    color:    0x204080,
    side:     THREE.DoubleSide,
    roughness:1,
    metalness:0.3
  });
  clothMaterial.positionNode = Compute.vertexPositionBuffer.element(
    attribute('vertexId')
  );

  const clothMesh = new THREE.Mesh(geom, clothMaterial);
  clothMesh.frustumCulled = false;

  // seam‐debug lines
  const lineGeo = new THREE.BufferGeometry();
  const posArr  = new Float32Array(seamDebugPairs.length * 6);
  seamDebugPairs.forEach(([i0,i1], k) => {
    const p0 = verletVertices[i0].position;
    const p1 = verletVertices[i1].position;
    posArr.set([p0.x,p0.y,p0.z, p1.x,p1.y,p1.z], k * 6);
  });
  lineGeo.setAttribute('position',
    new THREE.BufferAttribute(posArr, 3)
      .setUsage(THREE.DynamicDrawUsage)
  );
  const seamLines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({ color: 0xff0000 })
  );

  return { clothMesh, seamLines };
}
