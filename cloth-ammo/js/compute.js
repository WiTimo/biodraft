import * as THREE from 'three';
import {
  atomicStore, Fn, If, Return, instancedArray, instanceIndex,
  uniform, select, uint, Loop,
  float, triNoise3D, time, abs, clamp, vec3
} from 'three/tsl';

export let
  stiffnessUniform, windUniform,
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
  computeVertexForces,
  computeSeamMomentumKill,
  colliderPositionBuffer,
  colliderIndexBuffer,
  bvhRootsBuffer,
  bvhIndexBuffer,
  bvhIndirectBuffer,
  impactFlagBuffer,
  computeCollision,
  colliderIndexCountUniform,
  clearImpactFlag;

export function setupUniforms(params) {
  stiffnessUniform = uniform(params.stiffness);
  windUniform = uniform(params.wind);
  dampingUniform = uniform(0.98);
  gravityBaseUniform = uniform(0.0);
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
  //console.log('posArr',instancedArray(posArr, 'vec3').setPBO(true))
  vertexForceBuffer = instancedArray(n, 'vec3');
  vertexParamsBuffer = instancedArray(paramArr, 'uvec3');
  springListBuffer = instancedArray(new Uint32Array(springList), 'uint').setPBO(true);
  const idArr = new Uint32Array(m * 2);
  const restArr = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const s = verletSprings[i];
    idArr[i * 2] = s.v0;
    idArr[i * 2 + 1] = s.v1;
    restArr[i] = verletVertices[s.v0].position.distanceTo(verletVertices[s.v1].position);
  }
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
  impactFlagBuffer = instancedArray(new Uint32Array([0]), 'uint').setPBO(true).toAtomic();
}

export function setupColliderBuffers({ positions, indices, bvhRoots, bvhIndex, bvhIndirect }) {
  colliderPositionBuffer = instancedArray(positions, 'vec3').setPBO(true);
  if (!(indices instanceof Uint32Array)) indices = new Uint32Array(indices);
  colliderIndexBuffer = instancedArray(indices, 'uint').setPBO(true);
  colliderIndexCountUniform = uniform(indices.length);
  bvhRootsBuffer = instancedArray(bvhRoots, 'uint');
  bvhIndexBuffer = instancedArray(bvhIndex, 'uint');
  bvhIndirectBuffer = instancedArray(bvhIndirect, 'vec4').setPBO(true);
}

export function setupComputeShaders(verletVertices, verletSprings) {
  const vCount = verletVertices.length;
  const sCount = verletSprings.length;

  /*computeSpringForces = Fn(() => {
    console.log('computeSpringForces')
    If(instanceIndex.greaterThanEqual(uint(sCount)), () => Return());
    const sv = springVertexIdBuffer.element(instanceIndex);
    const p0 = vertexPositionBuffer.element(sv.x);
    const p1 = vertexPositionBuffer.element(sv.y);
    const d = p1.sub(p0).toVar();
    const dist = d.length().max(0.000001).toVar();
    const baseRest = springRestLengthBuffer.element(instanceIndex);
    const isSeam = springSeamFlagBuffer.element(instanceIndex).equal(uint(1));
    const rest = select(
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
  })().compute(sCount);*/

  const EPSILON = float(1e-6);

  computeSpringForces = Fn(() => {
    // 1) bounds-check spring index
    If(instanceIndex.greaterThanEqual(uint(sCount)), () => {
      console.log('⚠️ Spring index out of bounds:', instanceIndex);
      Return();
    });

    // 2) grab the two vertex IDs
    const sv = springVertexIdBuffer.element(instanceIndex);
    const v0 = sv.x, v1 = sv.y;

    // 3) sanity-check them
    If(
      v0.equal(v1)
        .or(v0.greaterThanEqual(uint(vCount)))
        .or(v1.greaterThanEqual(uint(vCount))),
      () => {
        console.log('⚠️ Invalid spring:', instanceIndex, 'v0:', v0, 'v1:', v1);
        springForceBuffer.element(instanceIndex).assign(vec3(0.0));
        Return();
      }
    );

    // 4) fetch positions, compute displacement & distance
    const p0 = vertexPositionBuffer.element(v0);
    const p1 = vertexPositionBuffer.element(v1);
    const d = p1.sub(p0).toVar('d');
    const dist = d.length().max(EPSILON).toVar('dist');

    // 5) compute rest length (with seam adjustment)
    const baseRest = springRestLengthBuffer.element(instanceIndex);
    const isSeam = springSeamFlagBuffer.element(instanceIndex).equal(uint(1));
    const seamT = clamp(seamTightnessUniform, float(0.0), float(1.0)).toVar('seamTightness');
    const rest = select(
      isSeam,
      baseRest.mul(float(1.0).sub(seamT)),
      baseRest
    ).max(EPSILON).toVar('rest');

    // 6) only apply force if stretched/compressed enough
    const deltaLength = dist.sub(rest).toVar('deltaLength');
    const doForce = deltaLength.abs().greaterThan(EPSILON);

    If(doForce, () => {
      // spring force magnitude/direction
      const force = d
        .mul(deltaLength)
        .mul(stiffnessUniform)
        .mul(float(0.5))
        .div(dist)
        .toVar('force');

      // catch NaNs
      If(
        force.x.notEqual(force.x)
          .or(force.y.notEqual(force.y))
          .or(force.z.notEqual(force.z)),
        () => {
          console.log('❌ NaN force at spring', instanceIndex, 'v0:', v0, 'v1:', v1, 'rest:', rest, 'dist:', dist);
          springForceBuffer.element(instanceIndex).assign(vec3(0.0));
          Return();
        }
      );

      springForceBuffer.element(instanceIndex).assign(force);
    }).Else(() => {
      // zero-out relaxed springs
      springForceBuffer.element(instanceIndex).assign(vec3(0.0));
    });
  })().compute(sCount);

  /*computeVertexForces = Fn(() => {
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
    let nextPos = pos.add(force).toVar('nextPos');
    vertexForceBuffer.element(instanceIndex).assign(force);
    vertexPositionBuffer.element(instanceIndex).assign(nextPos);
  })().compute(vCount);*/

  computeVertexForces = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(vCount)), () => Return());
    const param = vertexParamsBuffer.element(instanceIndex).toVar('param');
    If(param.x.greaterThan(uint(0)), () => Return());

    const pos = vertexPositionBuffer.element(instanceIndex).toVar('pos');
    let force = vec3(0.0).toVar('force');
    const end = param.z.add(param.y).toVar('end');

    Loop(
      { start: param.z, end, type: 'uint', condition: '<' },
      ({ i }) => {
        const sid = springListBuffer.element(i).toVar('sid');
        const sf = springForceBuffer.element(sid);
        const sv = springVertexIdBuffer.element(sid);
        const sign = select(sv.x.equal(instanceIndex), 1.0, -1.0);
        force.addAssign(sf.mul(sign));
      }
    );

    const gDyn = gravityBaseUniform.add(gravityAccelUniform.mul(time)).toVar('gDyn');
    force.y.subAssign(gDyn);

    const noise = triNoise3D(pos, 1, time).sub(0.2).mul(0.0002).toVar('noise');
    force.x.addAssign(noise.mul(windUniform));
    force.z.addAssign(noise.mul(windUniform));

    const nextPos = pos.add(force).toVar('nextPos');
    vertexForceBuffer.element(instanceIndex).assign(force);
    vertexPositionBuffer.element(instanceIndex).assign(nextPos);
  })().compute(vCount);

  /*computeSeamPosition = Fn(() => {
      // only run for spring indices < sCount
      If(instanceIndex.greaterThanEqual(uint(sCount)), () => Return());
  
      // only for seam springs
      const isSeam = springSeamFlagBuffer.element(instanceIndex).equal(uint(1));
      If(isSeam, () => {
        // get vertex IDs
        const sv = springVertexIdBuffer.element(instanceIndex);
        // read current positions
        let p0 = vertexPositionBuffer.element(sv.x).toVar('p0');
        let p1 = vertexPositionBuffer.element(sv.y).toVar('p1');
        // compute midpoint
        const mid = p0.add(p1).mul(0.5).toVar('mid');
        // lerp each end toward midpoint
        p0.addAssign(mid.sub(p0).mul(seamTightnessUniform));
        p1.addAssign(mid.sub(p1).mul(seamTightnessUniform));
        // write back
        vertexPositionBuffer.element(sv.x).assign(p0);
        vertexPositionBuffer.element(sv.y).assign(p1);
      });
    })().compute(sCount);*/

  /*computeCollision = Fn(() => {
    const flagPtr = impactFlagBuffer.element(uint(0));
    const p = vertexPositionBuffer.element(instanceIndex).toVar('p');  
    const triCount = colliderIndexCountUniform.div(uint(3));
    const threshold = float(0.001);
  
    // for each triangle
    Loop(
      { start: uint(0), end: triCount, type: 'uint', condition: '<' },
      ({ i: ti }) => {
  
        // load triangle vertex positions
        const i0 = colliderIndexBuffer.element(ti.mul(uint(3)    ));
        const i1 = colliderIndexBuffer.element(ti.mul(uint(3)).add(uint(1)));
        const i2 = colliderIndexBuffer.element(ti.mul(uint(3)).add(uint(2)));
        const v0 = colliderPositionBuffer.element(i0);
        const v1 = colliderPositionBuffer.element(i1);
        const v2 = colliderPositionBuffer.element(i2);
  
        // compute edges and vector from v0→p
        const e0  = v1.sub(v0).toVar('e0');
        const e1  = v2.sub(v0).toVar('e1');
        const v0p = p.sub(v0).toVar('v0p');
  
        // compute un-clamped barycentrics (v, w), with u = 1−v−w
        const d00  = e0.dot(e0);
        const d01  = e0.dot(e1);
        const d11  = e1.dot(e1);
        const d20  = v0p.dot(e0);
        const d21  = v0p.dot(e1);
        const denom = d00.mul(d11).sub(d01.mul(d01));
        const v    = d11.mul(d20).sub(d01.mul(d21)).div(denom);
        const w    = d00.mul(d21).sub(d01.mul(d20)).div(denom);
        let   vc   = clamp(v, float(0.0), float(1.0)).toVar('vc');
        let   wc   = clamp(w, float(0.0), float(1.0)).toVar('wc');
        let   uc   = float(1.0).sub(vc).sub(wc).toVar('uc');
  
        // reconstruct the closest point on (or in) the triangle
        const cp = v0.mul(uc)
                     .add(v1.mul(vc))
                     .add(v2.mul(wc))
                     .toVar('cp');
  
        // now test true 3D distance
        const diff  = p.sub(cp);
        const dist2 = diff.dot(diff);
        If(dist2.lessThan(threshold.mul(threshold)), () => {
          atomicStore(flagPtr, uint(1));
          Return();
        });
      }
    );
  })().compute(vCount);*/

  // ---- optimized computeCollision ----
  // ---- corrected computeCollision ----
computeCollision = Fn(() => {
  const flagPtr    = impactFlagBuffer.element(uint(0));
  const p          = vertexPositionBuffer.element(instanceIndex).toVar('p');
  const triCount   = colliderIndexCountUniform.div(uint(3));
  const threshold  = float(0.001);
  const threshold2 = threshold.mul(threshold).toVar('threshold2');

  Loop(
    { start: uint(0), end: triCount, type: 'uint', condition: '<' },
    ({ i: ti }) => {
      const base = ti.mul(uint(3));

      // load triangle indices
      const i0 = colliderIndexBuffer.element(base);
      const i1 = colliderIndexBuffer.element(base.add(uint(1)));
      const i2 = colliderIndexBuffer.element(base.add(uint(2)));

      // load positions
      const v0 = colliderPositionBuffer.element(i0);
      const v1 = colliderPositionBuffer.element(i1);
      const v2 = colliderPositionBuffer.element(i2);

      // edges
      const e0 = v1.sub(v0).toVar('e0');
      const e1 = v2.sub(v0).toVar('e1');

      // un-normalized normal
      const n = e0.cross(e1).toVar('n');

      // vector from v0 to p
      const v0p = p.sub(v0).toVar('v0p');

      // cheap plane test: (dot(v0p,n))² < threshold² * (n·n)
      const dn    = v0p.dot(n).toVar('dn');
      const area2 = n.dot(n).toVar('area2');
      const planeHit = dn.mul(dn).lessThan(threshold2.mul(area2));

      If(planeHit, () => {
        // full point→triangle distance:

        // barycentric coords on plane
        const d00   = e0.dot(e0);
        const d01   = e0.dot(e1);
        const d11   = e1.dot(e1);
        const d20   = v0p.dot(e0);
        const d21   = v0p.dot(e1);
        const denom = d00.mul(d11).sub(d01.mul(d01)).toVar('denom');

        const v     = d11.mul(d20).sub(d01.mul(d21)).div(denom);
        const w     = d00.mul(d21).sub(d01.mul(d20)).div(denom);

        const vc    = clamp(v, float(0.0), float(1.0)).toVar('vc');
        const wc    = clamp(w, float(0.0), float(1.0)).toVar('wc');
        const uc    = float(1.0).sub(vc).sub(wc).toVar('uc');

        // closest point on triangle
        const cp = v0.mul(uc)
                     .add(v1.mul(vc))
                     .add(v2.mul(wc))
                     .toVar('cp');

        // squared-distance test
        const diff  = p.sub(cp);
        const dist2 = diff.dot(diff);
        If(dist2.lessThan(threshold2), () => {
          atomicStore(flagPtr, uint(1));
          Return();
        });
      });
    }
  );
})().compute(vCount);

  computeSeamMomentumKill = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(sCount)), () => Return());
    const isSeam = springSeamFlagBuffer.element(instanceIndex).equal(uint(1));
    If(isSeam, () => {
      const sv = springVertexIdBuffer.element(instanceIndex);
      let v0 = vertexForceBuffer.element(sv.x).toVar('v0');
      let v1 = vertexForceBuffer.element(sv.y).toVar('v1');
      const avg = v0.add(v1).mul(0.5).toVar('avg');
      v0.addAssign(avg.sub(v0).mul(seamTightnessUniform));
      v1.addAssign(avg.sub(v1).mul(seamTightnessUniform));
      vertexForceBuffer.element(sv.x).assign(v0);
      vertexForceBuffer.element(sv.y).assign(v1);
    });
  })().compute(sCount);

  clearImpactFlag = Fn(() => {
    const ptr = impactFlagBuffer.element(uint(0));
    atomicStore(ptr, uint(0));
  })().compute(1);
}