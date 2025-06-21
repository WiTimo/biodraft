// File: js/compute/buffers.js

import { instancedArray } from 'three/tsl';

export let
  vertexPositionBuffer,
  vertexForceBuffer,
  vertexParamsBuffer,
  springListBuffer,
  springVertexIdBuffer,
  springRestLengthBuffer,
  springForceBuffer,
  springSeamFlagBuffer;

/**
 * Create GPU buffers for the cloth simulation.
 */
export function setupBuffers(verletVertices, verletSprings, seamDebugPairs) {
  const n = verletVertices.length;
  const m = verletSprings.length;

  // VERTEX DATA -----------------------------------
  const posArr     = new Float32Array(n * 3);
  const paramArr   = new Uint32Array(n * 3);
  const springList = [];
  verletVertices.forEach((v, i) => {
    posArr.set([v.position.x, v.position.y, v.position.z], i * 3);
    paramArr.set([v.isFixed, v.springIds.length, springList.length], i * 3);
    v.springIds.forEach(sid => springList.push(sid));
  });

  // --- mark these for PBO creation ---
  vertexPositionBuffer = instancedArray(posArr, 'vec3').setPBO(true);
  vertexForceBuffer    = instancedArray(n,      'vec3');                 // no PBO needed
  vertexParamsBuffer   = instancedArray(paramArr,'uvec3');               // no PBO needed
  springListBuffer     = instancedArray(new Uint32Array(springList), 'uint').setPBO(true);

  // SPRING DATA -----------------------------------
  const idArr   = new Uint32Array(m * 2);
  const restArr = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const s = verletSprings[i];
    idArr[2 * i    ] = s.v0;
    idArr[2 * i + 1] = s.v1;
    restArr[i]       = verletVertices[s.v0]
                          .position
                          .distanceTo(verletVertices[s.v1].position);
  }
  springVertexIdBuffer   = instancedArray(idArr,  'uvec2').setPBO(true);
  springRestLengthBuffer = instancedArray(restArr, 'float');            // no PBO needed
  springForceBuffer      = instancedArray(m * 3,   'vec3').setPBO(true);

  // SEAM FLAGS ------------------------------------
  const seamFlagArr = new Uint32Array(m);
  seamDebugPairs.forEach(([i0, i1]) => {
    const sid = verletSprings.findIndex(
      s => (s.v0 === i0 && s.v1 === i1) || (s.v0 === i1 && s.v1 === i0)
    );
    if (sid >= 0) seamFlagArr[sid] = 1;
  });
  springSeamFlagBuffer = instancedArray(seamFlagArr, 'uint');           // no PBO needed
}
