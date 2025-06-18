// js/compute.js

import * as THREE from 'three';
import {
  Fn, If, Return, instancedArray, instanceIndex,
  uniform, select, uint, Loop,
  float, triNoise3D, time
} from 'three/tsl';

export let stiffnessUniform, windUniform,
  spherePositionUniform, sphereUniform,
  sphereRadiusUniform,
  dampingUniform,
  gravityBaseUniform, gravityAccelUniform,
  // NEW:
  seamTightnessUniform,
  // BUFFERS:
  vertexPositionBuffer,
  vertexForceBuffer,
  vertexParamsBuffer,
  springListBuffer,
  springVertexIdBuffer,
  springRestLengthBuffer,
  springForceBuffer,
  // NEW:
  springSeamFlagBuffer,
  computeSpringForces,
  computeVertexForces;

// — UNIFORMS — 
export function setupUniforms(params) {
  stiffnessUniform = uniform(params.stiffness);
  windUniform = uniform(params.wind);
  spherePositionUniform = uniform(new THREE.Vector3());
  sphereUniform = uniform(1.0);
  sphereRadiusUniform = uniform(params.sphereRadius);
  dampingUniform = uniform(0.98);
  gravityBaseUniform = uniform(0.0);
  gravityAccelUniform = uniform(0.00002);
  // 0 → 1 over the first frames; set from main.js: 
  //   Compute.seamTightnessUniform.value = Math.min(timestamp*2, 1);
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
    // store the ORIGINAL distance
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

  // 1) compute each spring’s force
  computeSpringForces = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(sCount)), () => Return());

    // endpoints
    const sv = springVertexIdBuffer.element(instanceIndex);
    const p0 = vertexPositionBuffer.element(sv.x);
    const p1 = vertexPositionBuffer.element(sv.y);
    const d = p1.sub(p0).toVar();
    const dist = d.length().max(0.000001).toVar();

    // original rest
    const baseRest = springRestLengthBuffer.element(instanceIndex);
    // is it a seam?
    const isSeam = springSeamFlagBuffer.element(instanceIndex).equal(uint(1));
    // ramp rest from baseRest → 0 over [0…1] in seamTightnessUniform
    // when seamTightness==0: rest=baseRest; when ==1: rest=0.
    const rest = select(
      isSeam,
      baseRest.sub(baseRest.mul(seamTightnessUniform)),
      baseRest
    );

    // Hooke’s law
    const f = dist.sub(rest)
      .mul(stiffnessUniform)
      .mul(d)
      .mul(0.5)
      .div(dist);

    springForceBuffer.element(instanceIndex).assign(f);
  })().compute(sCount);

  // 2) accumulate per-vertex forces, apply damping, gravity, sphere
  computeVertexForces = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(vCount)), () => Return());
    const param = vertexParamsBuffer.element(instanceIndex).toVar();
    If(param.x.greaterThan(0), () => Return());

    // read current
    let pos = vertexPositionBuffer.element(instanceIndex).toVar('pos');
    let force = vertexForceBuffer.element(instanceIndex).toVar('force');
    force.mulAssign(dampingUniform);

    // add all connected springs
    const end = param.z.add(param.y).toVar('end');
    Loop({ start: param.z, end, type: 'uint', condition: '<' }, ({ i }) => {
      const sid = springListBuffer.element(i).toVar();
      const sf = springForceBuffer.element(sid);
      const sv = springVertexIdBuffer.element(sid);
      const sign = select(sv.x.equal(instanceIndex), 1.0, -1.0);
      force.addAssign(sf.mul(sign));
    });

    // gravity + wind noise
    const gDyn = gravityAccelUniform.mul(time).add(gravityBaseUniform);
    force.y.subAssign(gDyn);
    const noise = triNoise3D(pos, 1, time).sub(0.2).mul(0.0002);
    force.x.addAssign(noise.mul(windUniform));
    force.z.addAssign(noise.mul(windUniform));

    // sphere collision
    let nextPos = pos.add(force).toVar('nextPos');
    const dir = nextPos.sub(spherePositionUniform).toVar('dir');
    const dist = dir.length().toVar('dist');
    If(dist.lessThan(sphereRadiusUniform), () => {
      const nDir = dir.div(dist);
      nextPos.assign(spherePositionUniform.add(nDir.mul(sphereRadiusUniform)));
      const v = nextPos.sub(pos);
      const speed = v.length();
      const restF = select(speed.greaterThan(float(0.005)), float(1.2), float(0.8));
      force.assign(v.mul(restF));
    });

    vertexForceBuffer.element(instanceIndex).assign(force);
    vertexPositionBuffer.element(instanceIndex).assign(nextPos);
  })().compute(vCount);
}
