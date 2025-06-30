import * as THREE from 'three';
import {
  atomicStore, Fn, If, Return, instancedArray, instanceIndex,
  uniform, select, uint, Loop,
  float, triNoise3D, time, abs, clamp, vec3, array, bitcast
} from 'three/tsl';

const MAX_DEPTH = 10224;

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
  bvhRootsBuffer,
  bvhIndexBuffer,
  bvhIndirectBuffer,
  impactFlagBuffer,
  computeCollision,
  colliderIndexCountUniform,
  clearImpactFlag,
  bvhNodeCountUniform,
  bvhBoundsBuffer;

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
  vertexPositionBuffer = instancedArray(posArr, 'vec3')
  console.log('vertexPositionBuffer', vertexPositionBuffer)
  console.log('posArr sample:', posArr.slice(0, 9));
  vertexForceBuffer = instancedArray(n, 'vec3');
  vertexParamsBuffer = instancedArray(paramArr, 'uvec3');
  springListBuffer = instancedArray(new Uint32Array(springList), 'uint')
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
  springVertexIdBuffer = instancedArray(idArr, 'uvec2')
  springRestLengthBuffer = instancedArray(restArr, 'float');
  springForceBuffer = instancedArray(m * 3, 'vec3')
  springSeamFlagBuffer = instancedArray(seamFlagArr, 'uint');
  impactFlagBuffer = instancedArray(new Uint32Array([0]), 'uint').toAtomic();
}

// (1) Make sure your buffers are bound correctly in setupColliderBuffers:
export function setupColliderBuffers({
  positions,     // Float32Array
  indices,       // Uint32Array
  bvhIndexFloats,// Float32Array
  bvhIndirectUInts, // Uint32Array
  rootIndices    // Uint32Array
}) {
  colliderPositionBuffer = instancedArray(positions, 'vec3');
  colliderIndexBuffer = instancedArray(indices, 'uint');

  // These three *must* match the views you logged above:
  bvhBoundsBuffer = instancedArray(bvhIndexFloats, 'float');
  bvhIndexBuffer = instancedArray(bvhIndirectUInts, 'uint');
  bvhRootsBuffer = instancedArray(rootIndices, 'uint');

  const nodeCount = bvhIndexFloats.length / 8;
  bvhNodeCountUniform = uniform(nodeCount);
  impactFlagBuffer = instancedArray(new Uint32Array([0]), 'uint').toAtomic();
}

export function setupComputeShaders(verletVertices, verletSprings) {
  const vCount = verletVertices.length;
  const sCount = verletSprings.length;

  const EPSILON = float(1e-6);

  computeSpringForces = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(sCount)), () => {
      console.log('⚠️ Spring index out of bounds:', instanceIndex);
      Return();
    });

    const sv = springVertexIdBuffer.element(instanceIndex);
    const v0 = sv.x, v1 = sv.y;

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

    const p0 = vertexPositionBuffer.element(v0);
    const p1 = vertexPositionBuffer.element(v1);
    const d = p1.sub(p0).toVar('d');
    const dist = d.length().max(EPSILON).toVar('dist');

    const baseOffsetRest = springRestLengthBuffer.element(instanceIndex);
    const isSeam = springSeamFlagBuffer.element(instanceIndex).equal(uint(1));
    const seamT = clamp(seamTightnessUniform, float(0.0), float(1.0)).toVar('seamTightness');
    const rest = select(
      isSeam,
      baseOffsetRest.mul(float(1.0).sub(seamT)),
      baseOffsetRest
    ).max(EPSILON).toVar('rest');

    const deltaLength = dist.sub(rest).toVar('deltaLength');
    const doForce = deltaLength.abs().greaterThan(EPSILON);

    If(doForce, () => {
      const force = d
        .mul(deltaLength)
        .mul(stiffnessUniform)
        .mul(float(0.5))
        .div(dist)
        .toVar('force');

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

    const gDyn = gravitybaseOffsetUniform.add(gravityAccelUniform.mul(time)).toVar('gDyn');
    force.y.subAssign(gDyn);

    const noise = triNoise3D(pos, 1, time).sub(0.2).mul(0.0002).toVar('noise');
    force.x.addAssign(noise.mul(windUniform));
    force.z.addAssign(noise.mul(windUniform));

    const nextPos = pos.add(force).toVar('nextPos');
    vertexForceBuffer.element(instanceIndex).assign(force);
    vertexPositionBuffer.element(instanceIndex).assign(nextPos);
    console.log('vertexPositionBuffer', vertexPositionBuffer)
  })().compute(vCount);

  /*computeCollision = Fn(() => {
    const flagPtr = impactFlagBuffer.element(uint(0));

    const p = vertexPositionBuffer.element(instanceIndex);

    const nodeCount = bvhNodeCountUniform.toUint();

    const stride = uint(8);

    Loop(
      { start: uint(0), end: nodeCount, type: 'uint', condition: '<' },
      ({ i }) => {
        const base = i.mul(stride);

        const minX = bvhBoundsBuffer.element(base).toFloat();
        const minY = bvhBoundsBuffer.element(base.add(1)).toFloat();
        const minZ = bvhBoundsBuffer.element(base.add(2)).toFloat();
        const maxX = bvhBoundsBuffer.element(base.add(3)).toFloat();
        const maxY = bvhBoundsBuffer.element(base.add(4)).toFloat();
        const maxZ = bvhBoundsBuffer.element(base.add(5)).toFloat();

        const inside = p.x.greaterThanEqual(minX).and(p.x.lessThanEqual(maxX))
          .and(p.y.greaterThanEqual(minY)).and(p.y.lessThanEqual(maxY))
          .and(p.z.greaterThanEqual(minZ)).and(p.z.lessThanEqual(maxZ));

        //atomicStore(flagPtr, uint(bvhRoots.length));

        If(inside, () => {
          atomicStore(flagPtr, uint(1));
          Return();
        });
      }
    );
  })().compute(vCount);*/

  /*computeCollision = Fn(() => {
    const flagPtr = impactFlagBuffer.element(uint(0));

    const p = vertexPositionBuffer.element(instanceIndex);

    const nodeCount = bvhNodeCountUniform.toUint();

    const stride = uint(8);
    //const stack = array(uint(nodeCount), 'uint').toVar('stack'); // this line prevents me from setting the flag
    //const stack = array(uint(MAX_DEPTH), 'uint').toVar('stack');
    const stack =  array('uint', 64).toVar('stack');
    console.log('stack', stack)

    atomicStore(flagPtr, uint(10));
    Return()
  })().compute(vCount);*/

  computeCollision = Fn(() => {
    const flagPtr = impactFlagBuffer.element(uint(0));
    const p = vertexPositionBuffer.element(instanceIndex);
    // A tiny “sphere” radius for point collision:
    const eps2 = float(1e-6);

    // Small stack for binary BVH:
    const maxStack = 64;
    const stack = array('uint', maxStack).toVar('stack');
    let sp = uint(0).toVar('sp');

    // Push root node:
    const root = bvhRootsBuffer.element(uint(0)).toUint();
    stack.element(sp).assign(root);
    sp = sp.add(uint(1));

    const stride = uint(8);                       // 8 floats per node
    const nodeCount = bvhNodeCountUniform.toUint();

    // Traverse until empty or collision:
    Loop(
      { start: uint(0), end: maxStack, type: 'uint', condition: '<' },
      () => {
        // empty?
        If(sp.equal(uint(0)), () => Return());

        // pop
        sp = sp.sub(uint(1));
        const ni = stack.element(sp).toUint();
        const base = ni.mul(stride);

        // load AABB
        const minX = bvhBoundsBuffer.element(base).toFloat();
        const minY = bvhBoundsBuffer.element(base.add(1)).toFloat();
        const minZ = bvhBoundsBuffer.element(base.add(2)).toFloat();
        const maxX = bvhBoundsBuffer.element(base.add(3)).toFloat();
        const maxY = bvhBoundsBuffer.element(base.add(4)).toFloat();
        const maxZ = bvhBoundsBuffer.element(base.add(5)).toFloat();
        /* atomicStore(flagPtr, ni);
        Return(); */
        // sphere-AABB test
        const dx = select(p.x.lessThan(minX), minX.sub(p.x),
          select(p.x.greaterThan(maxX), p.x.sub(maxX), float(0.0)));
        const dy = select(p.y.lessThan(minY), minY.sub(p.y),
          select(p.y.greaterThan(maxY), p.y.sub(maxY), float(0.0)));
        const dz = select(p.z.lessThan(minZ), minZ.sub(p.z),
          select(p.z.greaterThan(maxZ), p.z.sub(maxZ), float(0.0)));
        const dist2 = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz));

        If(dist2.lessThanEqual(eps2), () => {
          // overlaps — read leaf fields
          const triOffset = bvhBoundsBuffer.element(base.add(6)).toUint();
          const triCount = bvhBoundsBuffer.element(base.add(7)).toUint();

          If(triCount.equal(uint(0)), () => {
            // internal node → push its two children
            // (children are stored in bvhIndexBuffer at [ni*2], [ni*2+1])
            const c0 = bvhIndexBuffer.element(ni.mul(uint(2))).toUint();
            const c1 = bvhIndexBuffer.element(ni.mul(uint(2)).add(1)).toUint();
            stack.element(sp).assign(c0); sp = sp.add(uint(1));
            stack.element(sp).assign(c1); sp = sp.add(uint(1));
          }).Else(() => {
            // leaf → test exactly triCount triangles
            const end = triOffset.add(triCount);
            Loop(
              { start: triOffset, end, type: 'uint', condition: '<' },
              ({ i: tidx }) => {
                // tidx indexes into your *mesh* index buffer
                const i0 = colliderIndexBuffer.element(tidx.mul(uint(3))).toUint();
                const i1 = colliderIndexBuffer.element(tidx.mul(uint(3)).add(1)).toUint();
                const i2 = colliderIndexBuffer.element(tidx.mul(uint(3)).add(2)).toUint();

                // load triangle verts
                const v0 = colliderPositionBuffer.element(i0);
                const v1 = colliderPositionBuffer.element(i1);
                const v2 = colliderPositionBuffer.element(i2);

                // barycentric test
                const e0 = v1.sub(v0), e1 = v2.sub(v0), vp = p.sub(v0);
                const d00 = e0.dot(e0), d01 = e0.dot(e1), d11 = e1.dot(e1);
                const d20 = vp.dot(e0), d21 = vp.dot(e1);
                const denom = d00.mul(d11).sub(d01.mul(d01)).max(float(1e-6));
                const v = d11.mul(d20).sub(d01.mul(d21)).div(denom);
                const w = d00.mul(d21).sub(d01.mul(d20)).div(denom);
                const u = float(1.0).sub(v).sub(w);
                If(u.greaterThanEqual(float(0.0))
                  .and(v.greaterThanEqual(float(0.0)))
                  .and(w.greaterThanEqual(float(0.0))),
                  () => {
                    atomicStore(flagPtr, uint(1));
                    Return();
                  }
                );
              }
            );
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