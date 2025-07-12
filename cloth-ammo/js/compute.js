import {
  atomicStore, Fn, If, Return, instancedArray, instanceIndex,
  uniform, select, uint, Loop,
  float, triNoise3D, time, clamp, vec3, array
} from 'three/tsl';

export let
  stiffnessUniform, windUniform,
  dampingUniform,
  gravitybaseOffsetUniform, gravityAccelUniform,
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
  computeVertexForces,
  computeSeamMomentumKill,
  colliderPositionBuffer,
  colliderIndexBuffer,
  impactFlagBuffer,
  computeCollision,
  colliderIndexCountUniform,
  clearCollisionBuffers,
  bvhNodeCountUniform,
  bvhBoundsBuffer,
  collisionDepthBuffer,
  collisionProjBuffer,
  triCount;

export function setupUniforms(params) {
  stiffnessUniform = uniform(params.stiffness);
  windUniform = uniform(params.wind);
  dampingUniform = uniform(0.98);
  gravitybaseOffsetUniform = uniform(0.0);
  gravityAccelUniform = uniform(0.0);
  seamTightnessUniform = uniform(0.0);
}

export function setupBuffers(verletVertices, verletSprings, seamDebugPairs) {
  const n = verletVertices.length;
  const m = verletSprings.length;

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

  const idArr = new Uint32Array(m * 2);
  const restArr = new Float32Array(m);
  verletSprings.forEach((s, i) => {
    idArr[i * 2] = s.v0;
    idArr[i * 2 + 1] = s.v1;
    restArr[i] = verletVertices[s.v0].position.distanceTo(verletVertices[s.v1].position);
  });
  springVertexIdBuffer = instancedArray(idArr, 'uvec2').setPBO(true);
  springRestLengthBuffer = instancedArray(restArr, 'float');
  springForceBuffer = instancedArray(m * 3, 'vec3').setPBO(true);

  const seamFlagArr = new Uint32Array(m);
  const map = new Map();
  verletSprings.forEach((s, i) => {
    map.set(`${s.v0},${s.v1}`, i);
    map.set(`${s.v1},${s.v0}`, i);
  });
  seamDebugPairs.forEach(([i0, i1]) => {
    const sid = map.get(`${i0},${i1}`);
    if (sid !== undefined) seamFlagArr[sid] = 1;
  });
  springSeamFlagBuffer = instancedArray(seamFlagArr, 'uint');

  impactFlagBuffer = instancedArray(new Uint32Array([0]), 'uint').setPBO(true).toAtomic();
  collisionDepthBuffer = instancedArray(new Float32Array(n), 'float').setPBO(true);
  collisionProjBuffer = instancedArray(new Float32Array(n * 3), 'vec3').setPBO(true);
}

export function setupColliderBuffers({ positions, indices, bvhBounds }) {
  colliderPositionBuffer = instancedArray(positions, 'vec3').setPBO(true);
  if (!(indices instanceof Uint32Array)) indices = new Uint32Array(indices);
  colliderIndexBuffer = instancedArray(indices, 'uint').setPBO(true);
  colliderIndexCountUniform = uniform(indices.length);

  bvhBoundsBuffer = instancedArray(bvhBounds, 'float').setPBO(true);

  const nodeCount = bvhBounds.length / 8;
  bvhNodeCountUniform = uniform(nodeCount);

  triCount = indices.length / 3;
}

export function setupComputeShaders(verletVertices, verletSprings) {
  const vCount = verletVertices.length;
  const sCount = verletSprings.length;
  const EPS = float(1e-6);

  computeSpringForces = Fn(() => {
    const springIndex = instanceIndex;
    const vertexPair = springVertexIdBuffer.element(springIndex);
    const posA = vertexPositionBuffer.element(vertexPair.x);
    const posB = vertexPositionBuffer.element(vertexPair.y);
    const directionVec = posB.sub(posA).toVar('directionVec');
    const currentLength = directionVec.length().max(EPS).toVar('currentLength');

    const restLenBase = springRestLengthBuffer.element(springIndex);
    const isSeamSpring = springSeamFlagBuffer.element(springIndex).equal(uint(1));
    const seamTightnessClamped = clamp(seamTightnessUniform, float(0), float(1));
    const targetRestLength = select(
      isSeamSpring,
      restLenBase.mul(float(1).sub(seamTightnessClamped)),
      restLenBase
    ).max(EPS);

    const displacement = currentLength.sub(targetRestLength).toVar('displacement');
    const shouldApplyForce = displacement.abs().greaterThan(EPS);

    const depthA = collisionDepthBuffer.element(vertexPair.x);
    const depthB = collisionDepthBuffer.element(vertexPair.y);
    const eitherInCollision = depthA.greaterThan(float(0)).or(depthB.greaterThan(float(0)));
    const bothInCollision = depthA.greaterThan(float(0)).and(depthB.greaterThan(float(0)));

    If(shouldApplyForce, () => {

      const forceVec = directionVec
        .mul(displacement)
        .mul(stiffnessUniform)
        .mul(float(0.5))
        .div(currentLength)
        .toVar('forceVec');

      const maxForce = select(
        bothInCollision, float(0.005),
        select(eitherInCollision, float(0.015), float(0.035))
      );

      const forceMag = forceVec.length();
      const clampedForce = select(
        forceMag.greaterThan(maxForce),
        forceVec.mul(maxForce.div(forceMag)),
        forceVec
      );

      const stiffnessReduction = select(
        bothInCollision, float(0.2),
        select(eitherInCollision, float(0.4), float(1.0))
      );

      const collisionDamping = select(eitherInCollision, float(0.4), float(1.0));
      springForceBuffer.element(springIndex).assign(clampedForce.mul(collisionDamping).mul(stiffnessReduction));
    }).Else(() => {
      springForceBuffer.element(springIndex).assign(vec3(0));
    });
  })().compute(sCount);

  computeCollision = Fn(() => {
    const vid = instanceIndex;
    const P = vertexPositionBuffer.element(vid);

    collisionDepthBuffer.element(vid).assign(float(0));
    collisionProjBuffer.element(vid).assign(vec3(0));

    let bestDepth = float(0).toVar('bestDepth');
    let bestProj = vec3(0).toVar('bestProj');
    const MIN_DIST = float(-0.02);
    const triCount = colliderIndexCountUniform.div(uint(3));

    Loop({ start: uint(0), end: triCount, type: 'uint', condition: '<' }, ({ i: ti }) => {
      const base = ti.mul(uint(3));
      const i0 = colliderIndexBuffer.element(base);
      const i1 = colliderIndexBuffer.element(base.add(1));
      const i2 = colliderIndexBuffer.element(base.add(2));

      const A = colliderPositionBuffer.element(i0);
      const B = colliderPositionBuffer.element(i1);
      const C = colliderPositionBuffer.element(i2);

      const e1 = B.sub(A).toVar('e1');
      const e2 = C.sub(A).toVar('e2');
      const N = e1.cross(e2).normalize().toVar('N');

      const vPA = P.sub(A).toVar('vPA');
      const distPlane = vPA.dot(N).toVar('distPlane');

      If(distPlane.lessThan(float(0)).and(distPlane.greaterThan(MIN_DIST)), () => {

        const proj = P.sub(N.mul(distPlane)).toVar('proj');

        const v0 = e1;
        const v1 = e2;
        const v2 = proj.sub(A);

        const d00 = v0.dot(v0);
        const d01 = v0.dot(v1);
        const d11 = v1.dot(v1);
        const d20 = v2.dot(v0);
        const d21 = v2.dot(v1);

        const denom = d00.mul(d11).sub(d01.mul(d01)).toVar('denom');
        const vv = d11.mul(d20).sub(d01.mul(d21)).div(denom).toVar('vv');
        const ww = d00.mul(d21).sub(d01.mul(d20)).div(denom).toVar('ww');
        const uu = float(1).sub(vv).sub(ww);

        If(uu.greaterThanEqual(float(0))
          .and(vv.greaterThanEqual(float(0)))
          .and(ww.greaterThanEqual(float(0))
            .and(uu.add(vv).add(ww).lessThanEqual(float(1.01)))), () => {

              const depth = distPlane.mul(float(-1)).toVar('depth');
              If(depth.greaterThan(bestDepth), () => {
                bestDepth.assign(depth);
                bestProj.assign(proj);
              });
            });
      });
    });

    If(bestDepth.greaterThan(float(0)), () => {
      collisionDepthBuffer.element(vid).assign(bestDepth);
      collisionProjBuffer.element(vid).assign(bestProj);
    });
  })().compute(vCount);

  clearCollisionBuffers = Fn(() => {
    const vid = instanceIndex;
    If(vid.greaterThanEqual(uint(vCount)), () => Return());

    collisionDepthBuffer.element(vid).assign(float(0));
    collisionProjBuffer.element(vid).assign(vec3(0));
  })().compute(vCount);

  computeVertexForces = Fn(() => {
    const vid = instanceIndex;
    If(vid.greaterThanEqual(uint(vCount)), () => Return());
    If(vertexParamsBuffer.element(vid).x.greaterThan(uint(0)), () => Return());

    const pos = vertexPositionBuffer.element(vid).toVar('pos');
    let force = vec3(0.0).toVar('force');
    const end = vertexParamsBuffer.element(vid).z.add(
      vertexParamsBuffer.element(vid).y
    );

    Loop({ start: vertexParamsBuffer.element(vid).z, end, type: 'uint', condition: '<' }, ({ i }) => {
      const sid = springListBuffer.element(i);
      const f = springForceBuffer.element(sid);
      const sv = springVertexIdBuffer.element(sid);
      const sign = select(sv.x.equal(vid), 1.0, -1.0);
      force.addAssign(f.mul(sign));
    });

    force.mulAssign(dampingUniform);

    const gDyn = gravitybaseOffsetUniform.add(gravityAccelUniform.mul(time));
    force.y.subAssign(gDyn);

    const collisionDepth = collisionDepthBuffer.element(vid);
    const isInCollision = collisionDepth.greaterThan(float(0));

    If(isInCollision, () => {
      const collisionProj = collisionProjBuffer.element(vid);

      const correctionStrength = float(0.5);
      const correctedPos = pos.add(collisionProj.sub(pos).mul(correctionStrength));

      force.mulAssign(float(0.8));

      vertexPositionBuffer.element(vid).assign(correctedPos);
      vertexForceBuffer.element(vid).assign(force);
    }).Else(() => {

      const nextPos = pos.add(force);
      vertexPositionBuffer.element(vid).assign(nextPos);
      vertexForceBuffer.element(vid).assign(force);
    });
  })().compute(vCount);

  computeSeamMomentumKill = Fn(() => {
    const sid = instanceIndex;
    If(sid.greaterThanEqual(uint(sCount)), () => Return());
    If(springSeamFlagBuffer.element(sid).equal(uint(1)), () => {
      const sv = springVertexIdBuffer.element(sid);
      let f0 = vertexForceBuffer.element(sv.x).toVar('f0');
      let f1 = vertexForceBuffer.element(sv.y).toVar('f1');
      const avg = f0.add(f1).mul(0.5);
      f0 = f0.add(avg.sub(f0).mul(seamTightnessUniform));
      f1 = f1.add(avg.sub(f1).mul(seamTightnessUniform));
      vertexForceBuffer.element(sv.x).assign(f0);
      vertexForceBuffer.element(sv.y).assign(f1);
    });
  })().compute(sCount);

}