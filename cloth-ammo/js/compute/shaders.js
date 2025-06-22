import {
  Fn,
  If,
  Return,
  Loop,
  select,
  uint,
  triNoise3D,
  time,
  instanceIndex
} from 'three/tsl';

import {
  vertexPositionBuffer,
  vertexParamsBuffer,
  vertexForceBuffer,
  springListBuffer,
  springVertexIdBuffer,
  springRestLengthBuffer,
  springForceBuffer,
  springSeamFlagBuffer
} from './buffers.js';

import {
  stiffnessUniform,
  windUniform,
  dampingUniform,
  gravityBaseUniform,
  gravityAccelUniform,
  seamTightnessUniform,
  sphereRadiusUniform,
  sphereCenterUniform
} from './uniforms.js';

export let computeSpringForces, computeVertexForces;

export function setupComputeShaders(verletVertices, verletSprings) {
  const vCount = verletVertices.length;
  const sCount = verletSprings.length;

  // 1) compute spring forces
  computeSpringForces = Fn(() => {
    const sv    = springVertexIdBuffer.element(instanceIndex);
    const p0    = vertexPositionBuffer.element(sv.x);
    const p1    = vertexPositionBuffer.element(sv.y);
    const delta = p1.sub(p0).toVar();
    const dist  = delta.length().max(0.000001).toVar();
    const baseR = springRestLengthBuffer.element(instanceIndex);
    const isS   = springSeamFlagBuffer.element(instanceIndex).equal(uint(1));
    const rest  = select(
      isS,
      baseR.sub(baseR.mul(seamTightnessUniform)),
      baseR
    );
    const f = dist.sub(rest)
      .mul(stiffnessUniform)
      .mul(delta)
      .mul(0.5)
      .div(dist);
    springForceBuffer.element(instanceIndex).assign(f);
  })().compute(sCount);

  // 2) integrate Verlet + forces + sphere‐collision
  computeVertexForces = Fn(() => {
    const param = vertexParamsBuffer.element(instanceIndex).toVar();

    // skip fixed vertices
    If(param.x.greaterThan(uint(0)), () => Return());

    let pos   = vertexPositionBuffer.element(instanceIndex).toVar('pos');
    let force = vertexForceBuffer.element(instanceIndex).toVar('force');
    force.mulAssign(dampingUniform);

    const end = param.z.add(param.y).toVar('end');
    Loop({ start: param.z, end, type: 'uint', condition: '<' }, ({ i }) => {
      const sid = springListBuffer.element(i).toVar();
      const sf  = springForceBuffer.element(sid);
      const sv  = springVertexIdBuffer.element(sid);
      const sign= sv.x.equal(instanceIndex).select(1.0, -1.0);
      force.addAssign(sf.mul(sign));
    });

    const gDyn  = gravityAccelUniform.mul(time).add(gravityBaseUniform);
    force.y.subAssign(gDyn);
    const noise = triNoise3D(pos, 1, time).sub(0.2).mul(0.0002);
    force.x.addAssign(noise.mul(windUniform));
    force.z.addAssign(noise.mul(windUniform));

    // Verlet: predict nextPos
    const nextPos = pos.add(force).toVar('nextPos');

    // --- sphere collision: if inside, push out to surface ---
    const sc      = sphereCenterUniform.toVar();
    const dir     = nextPos.sub(sc).toVar('dir');
    const dist    = dir.length().toVar('dist');
    const isIn    = dist.lessThan(sphereRadiusUniform);
    const normDir = dir.div(dist).toVar('normDir');
    const sphPos  = sc.add(normDir.mul(sphereRadiusUniform));
    nextPos.assign(isIn.select(sphPos, nextPos));

    // write back
    vertexForceBuffer.element(instanceIndex).assign(force);
    vertexPositionBuffer.element(instanceIndex).assign(nextPos);
  })().compute(vCount);
}
