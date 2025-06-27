import * as THREE from 'three';
import {
  atomicStore, Fn, If, Return, instancedArray, instanceIndex,
  uniform, select, uint, Loop,
  float, triNoise3D, time, abs, clamp, vec3, array, bitcast
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
  impactFlagBuffer,
  computeCollision,
  clearImpactFlag,
  colliderPositionBuffer,
  colliderIndexBuffer,
  colliderIndexCountUniform,
  bvhAABBBuffer,
  bvhChildBuffer,
  bvhIndirectBuffer,
  bvhNodeCountUniform;

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
  console.log('posArr sample:', posArr.slice(0, 9));
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

export function setupColliderBuffers({
  positions,
  indices,
  bvhAABBFloats,   // Float32Array of all [minX,minY,minZ,maxX,maxY,maxZ]
  bvhChildIndices, // Uint32Array of 2×child-pointers per node
  bvhIndirect
}) {
  // 1) position & index buffers (unchanged)
  colliderPositionBuffer = instancedArray(positions, 'vec3').setPBO(true);
  colliderIndexBuffer    = instancedArray(indices,   'uint').setPBO(true);
  colliderIndexCountUniform = uniform(indices.length);

  // 2) AABB extents buffer
  if (!(bvhAABBFloats instanceof Float32Array)) {
    throw new Error('Expected bvhAABBFloats to be Float32Array');
  }
  bvhAABBBuffer = instancedArray(bvhAABBFloats, 'float').setPBO(true);
  console.log('bvhAABBFloats sample:', bvhAABBBuffer);
  // 3) Child-pointer buffer
  if (!(bvhChildIndices instanceof Uint32Array)) {
    throw new Error('Expected bvhChildIndices to be Uint32Array');
  }
  bvhChildBuffer = instancedArray(bvhChildIndices, 'uint').setPBO(true);

  // 4) Node count uniform
  bvhNodeCountUniform = uniform(bvhAABBFloats.length / 6);

  // 5) indirect buffer (leaf→triangle lookup)
  bvhIndirectBuffer = instancedArray(bvhIndirect, 'vec4').setPBO(true);
}


export function setupComputeShaders(verletVertices, verletSprings) {
  const vCount = verletVertices.length;
  const sCount = verletSprings.length;

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

computeCollision = Fn(() => {
  const flagPtr = impactFlagBuffer.element(uint(0));
  atomicStore(flagPtr, uint(0));

  const p = vertexPositionBuffer.element(instanceIndex);

  const sp    = uint(0).toVar('sp');
  const stack = array('uint', 64).toVar('stack');


  stack.element(sp).assign(uint(0));
  sp.addAssign(uint(1));

  Loop(
    { start: uint(0), end: uint(64), type: 'uint', condition: '<' },
    () => {
      If(sp.equal(uint(0)), () => { Return(); });

      sp.subAssign(uint(1));
      const node = stack.element(sp).toVar('node');

      const fBase = node.mul(uint(6));
      const minX = bvhAABBBuffer.element(fBase.add(0)).toFloat();
      const minY = bvhAABBBuffer.element(fBase.add(1)).toFloat();
      const minZ = bvhAABBBuffer.element(fBase.add(2)).toFloat();
      const maxX = bvhAABBBuffer.element(fBase.add(3)).toFloat();
      const maxY = bvhAABBBuffer.element(fBase.add(4)).toFloat();
      const maxZ = bvhAABBBuffer.element(fBase.add(5)).toFloat();
/* 
      atomicStore(flagPtr, minX);
      Return(); */

      const inside = p.x.greaterThanEqual(minX).and(p.x.lessThanEqual(maxX))
                     .and(p.y.greaterThanEqual(minY).and(p.y.lessThanEqual(maxY)))
                     .and(p.z.greaterThanEqual(minZ).and(p.z.lessThanEqual(maxZ)));

      If(inside, () => {
        atomicStore(flagPtr, uint(1));
        Return();
      });

      const iBase = node.mul(uint(2));
      const left  = bvhChildBuffer.element(iBase.add(0));
      const right = bvhChildBuffer.element(iBase.add(1));

      stack.element(sp).assign(left);
      sp.addAssign(uint(1));
      stack.element(sp).assign(right);
      sp.addAssign(uint(1));
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