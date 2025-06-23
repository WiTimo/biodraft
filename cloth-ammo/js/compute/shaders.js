// js/compute/shaders.js

import { Fn, If, Return, instanceIndex, select, Loop, float, uint, triNoise3D, time } from 'three/tsl';
import {
  vertexPositionBuffer,
  vertexForceBuffer,
  vertexParamsBuffer,
  springListBuffer,
  springVertexIdBuffer,
  springRestLengthBuffer,
  springForceBuffer,
  springSeamFlagBuffer
} from './buffers.js';
import {
  stiffnessUniform,
  windUniform,
  spherePositionUniform,
  sphereUniform,
  sphereRadiusUniform,
  dampingUniform,
  gravityBaseUniform,
  gravityAccelUniform,
  seamTightnessUniform
} from './uniforms.js';

export let computeSpringForces, computeVertexForces;

export function setupComputeShaders(verletVertices, verletSprings) {
  const vCount = verletVertices.length;
  const sCount = verletSprings.length;

  // 1) compute each spring’s force
  computeSpringForces = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(sCount)), () => Return());

    const sv   = springVertexIdBuffer.element(instanceIndex);
    const p0   = vertexPositionBuffer.element(sv.x);
    const p1   = vertexPositionBuffer.element(sv.y);
    const d    = p1.sub(p0).toVar();
    const dist = d.length().max(0.000001).toVar();

    const baseRest = springRestLengthBuffer.element(instanceIndex);
    const isSeam   = springSeamFlagBuffer.element(instanceIndex).equal(uint(1));
    const rest     = select(
      isSeam,
      baseRest.sub(baseRest.mul(seamTightnessUniform)),
      baseRest
    );

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

    let pos   = vertexPositionBuffer.element(instanceIndex).toVar('pos');
    let force = vertexForceBuffer.element(instanceIndex).toVar('force');
    force.mulAssign(dampingUniform);

    const end = param.z.add(param.y).toVar('end');
    Loop({ start: param.z, end, type: 'uint', condition: '<' }, ({ i }) => {
      const sid = springListBuffer.element(i).toVar();
      const sf  = springForceBuffer.element(sid);
      const sv  = springVertexIdBuffer.element(sid);
      const sign= select(sv.x.equal(instanceIndex), 1.0, -1.0);
      force.addAssign(sf.mul(sign));
    });

    const gDyn = gravityAccelUniform.mul(time).add(gravityBaseUniform);
    force.y.subAssign(gDyn);
    const noise = triNoise3D(pos, 1, time).sub(0.2).mul(0.0002);
    force.x.addAssign(noise.mul(windUniform));
    force.z.addAssign(noise.mul(windUniform));

    let nextPos = pos.add(force).toVar('nextPos');
    const dir  = nextPos.sub(spherePositionUniform).toVar('dir');
    const dist = dir.length().toVar('dist');
    If(dist.lessThan(sphereRadiusUniform), () => {
      const nDir   = dir.div(dist);
      nextPos.assign(spherePositionUniform.add(nDir.mul(sphereRadiusUniform)));
      const v      = nextPos.sub(pos);
      const speed  = v.length();
      const restF  = select(speed.greaterThan(float(0.005)), float(1.2), float(0.8));
      force.assign(v.mul(restF));
    });

    vertexForceBuffer.element(instanceIndex).assign(force);
    vertexPositionBuffer.element(instanceIndex).assign(nextPos);
  })().compute(vCount);
}
