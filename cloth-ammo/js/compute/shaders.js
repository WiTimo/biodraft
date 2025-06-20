// js/compute/shaders.js

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
  springSeamFlagBuffer,
  sphereBuffer,
  sphereCountUniform
} from './buffers.js';
import {
  stiffnessUniform,
  windUniform,
  dampingUniform,
  gravityBaseUniform,
  gravityAccelUniform,
  seamTightnessUniform,
  sphereRadiusUniform
} from './uniforms.js';

export let computeSpringForces, computeVertexForces, computeCollision;

export function setupComputeShaders(verletVertices, verletSprings) {
  const vCount = verletVertices.length;
  const sCount = verletSprings.length;

  // 1) compute spring forces
  computeSpringForces = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(sCount)), () => Return());
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

  // 2) integrate Verlet + forces
  computeVertexForces = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(vCount)), () => Return());
    const param = vertexParamsBuffer.element(instanceIndex).toVar();
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

    const nextPos = pos.add(force).toVar('nextPos');
    vertexForceBuffer.element(instanceIndex).assign(force);
    vertexPositionBuffer.element(instanceIndex).assign(nextPos);
  })().compute(vCount);

  // 3) SPHERE COLLISION PASS
  computeCollision = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(vCount)), () => Return());
    let p = vertexPositionBuffer.element(instanceIndex).toVar('p');

    Loop(
      { start: uint(0), end: sphereCountUniform, type: 'uint', condition: '<' },
      ({ i }) => {
        const c   = sphereBuffer.element(i);
        const dir = p.sub(c).toVar();
        const d   = dir.length().toVar();
        If(d.lessThan(sphereRadiusUniform), () => {
          const n = dir.div(d);
          p = c.add(n.mul(sphereRadiusUniform));
        });
      }
    );

    vertexPositionBuffer.element(instanceIndex).assign(p);
  })().compute(vCount);
}
