// File: js/compute.js

import * as THREE from 'three';
import {
  Fn, If, Return, instancedArray, instanceIndex,
  uniform, select, uint, Loop,
  float, triNoise3D, time
} from 'three/tsl';

export let stiffnessUniform, windUniform,
  dampingUniform,
  gravityBaseUniform, gravityAccelUniform,
  seamTightnessUniform,
  vertexPositionBuffer,
  vertexForceBuffer,
  vertexParamsBuffer,
  springListBuffer,
  springVertexIdBuffer,
  springRestLengthBuffer,
  springForceBuffer,
  springSeamFlagBuffer,
  computeSpringForces,
  computeVertexForces;

// — UNIFORMS —
export function setupUniforms(params) {
  stiffnessUniform = uniform(params.stiffness);
  windUniform = uniform(params.wind);
  dampingUniform = uniform(0.98);
  gravityBaseUniform = uniform(0.0);
  gravityAccelUniform = uniform(0.00002);
  seamTightnessUniform = uniform(0.0);
}

// — BUFFERS —
export function setupBuffers(verletVertices, verletSprings, seamDebugPairs) {
  const n = verletVertices.length;
  const m = verletSprings.length;

  // VERTEX DATA
  const posArr = new Float32Array(n * 3);
  const paramArr = new Uint32Array(n * 3);
  const springList = [];
  verletVertices.forEach((v, i) => {
    posArr.set([v.position.x, v.position.y, v.position.z], i * 3);
    paramArr.set([v.isFixed, v.springIds.length, springList.length], i * 3);
    v.springIds.forEach(sid => springList.push(sid));
  });
  vertexPositionBuffer = instancedArray(posArr, 'vec3').setPBO(true);
  vertexForceBuffer = instancedArray(n, 'vec3');
  vertexParamsBuffer = instancedArray(paramArr, 'uvec3');
  springListBuffer = instancedArray(new Uint32Array(springList), 'uint').setPBO(true);

  // SPRING DATA
  const idArr = new Uint32Array(m * 2);
  const restArr = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const s = verletSprings[i];
    idArr[i * 2 + 0] = s.v0;
    idArr[i * 2 + 1] = s.v1;
    restArr[i] = verletVertices[s.v0].position.distanceTo(verletVertices[s.v1].position);
  }

  // FLAG WHICH SPRINGS ARE SEAMS
  const seamFlagArr = new Uint32Array(m);
  seamDebugPairs.forEach(([i0, i1]) => {
    const sid = verletSprings.findIndex(s =>
      (s.v0 === i0 && s.v1 === i1) || (s.v0 === i1 && s.v1 === i0)
    );
    if (sid >= 0) seamFlagArr[sid] = 1;
  });

  springVertexIdBuffer = instancedArray(idArr, 'uvec2').setPBO(true);
  springRestLengthBuffer = instancedArray(restArr, 'float');
  springForceBuffer = instancedArray(m * 3, 'vec3').setPBO(true);
  springSeamFlagBuffer = instancedArray(seamFlagArr, 'uint');
}

// — COMPUTE SHADERS —
export function setupComputeShaders(verletVertices, verletSprings) {
  const vCount = verletVertices.length;
  const sCount = verletSprings.length;

  // 1) compute spring forces
  computeSpringForces = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(sCount)), () => Return());
    const sv = springVertexIdBuffer.element(instanceIndex);
    const p0 = vertexPositionBuffer.element(sv.x);
    const p1 = vertexPositionBuffer.element(sv.y);
    const d = p1.sub(p0).toVar();
    const dist = d.length().max(0.000001).toVar();
    const baseR = springRestLengthBuffer.element(instanceIndex);
    const isS = springSeamFlagBuffer.element(instanceIndex).equal(uint(1));
    const rest = select(
      isS,
      baseR.sub(baseR.mul(seamTightnessUniform)),
      baseR
    );
    const f = dist.sub(rest)
      .mul(stiffnessUniform)
      .mul(d)
      .mul(0.5)
      .div(dist);
    springForceBuffer.element(instanceIndex).assign(f);
  })().compute(sCount);

  // 2) accumulate vertex forces, apply damping, gravity, wind
  computeVertexForces = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(vCount)), () => Return());
    const param = vertexParamsBuffer.element(instanceIndex).toVar();
    If(param.x.greaterThan(0), () => Return());

    let pos = vertexPositionBuffer.element(instanceIndex).toVar('pos');
    let force = vertexForceBuffer.element(instanceIndex).toVar('force');
    force.mulAssign(dampingUniform);

    const end = param.z.add(param.y).toVar('end');
    Loop({ start: param.z, end, type: 'uint', condition: '<' }, ({ i }) => {
      const sid = springListBuffer.element(i).toVar();
      const sf = springForceBuffer.element(sid);
      const sv = springVertexIdBuffer.element(sid);
      const sign = select(sv.x.equal(instanceIndex), 1.0, -1.0);
      force.addAssign(sf.mul(sign));
    });

    const gDyn = gravityAccelUniform.mul(time).add(gravityBaseUniform);
    force.y.subAssign(gDyn);
    const noise = triNoise3D(pos, 1, time).sub(0.2).mul(0.0002);
    force.x.addAssign(noise.mul(windUniform));
    force.z.addAssign(noise.mul(windUniform));

    const nextPos = pos.add(force).toVar('nextPos');
    vertexForceBuffer.element(instanceIndex).assign(force);
    vertexPositionBuffer.element(instanceIndex).assign(nextPos);
  })().compute(vCount);
}
