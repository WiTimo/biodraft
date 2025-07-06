import {
  atomicStore, Fn, If, Return, instancedArray, instanceIndex,
  uniform, select, uint, Loop,
  float, triNoise3D, time, clamp, vec3, array
} from 'three/tsl';

const MAX_DEPTH = 60;

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
  clearCollisionBuffers,
  bvhNodeCountUniform,
  bvhBoundsBuffer,
  collisionDepthBuffer,
  collisionProjBuffer,
  triCount,
  debugBoundsFloatBuffer,
  debugPosBuffer;

export function setupUniforms(params) {
  stiffnessUniform = uniform(params.stiffness);
  windUniform = uniform(params.wind);
  dampingUniform = uniform(0.995);
  gravitybaseOffsetUniform = uniform(0.0);
  gravityAccelUniform = uniform(0.0);
  seamTightnessUniform = uniform(0.0);
}

export function setupBuffers(verletVertices, verletSprings, seamDebugPairs) {
  const n = verletVertices.length;
  const m = verletSprings.length;

  // vertex positions & params
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

  // springs
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

  // seam flags
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

  // collision outputs
  impactFlagBuffer = instancedArray(new Uint32Array([0]), 'uint').setPBO(true).toAtomic();
  collisionDepthBuffer = instancedArray(new Float32Array(n), 'float').setPBO(true);
  collisionProjBuffer = instancedArray(new Float32Array(n * 3), 'vec3').setPBO(true);
}

export function setupColliderBuffers({ positions, indices, bvhRoots, bvhBounds, bvhIndex, bvhIndirect }) {
  colliderPositionBuffer = instancedArray(positions, 'vec3').setPBO(true);
  if (!(indices instanceof Uint32Array)) indices = new Uint32Array(indices);
  colliderIndexBuffer = instancedArray(indices, 'uint').setPBO(true);
  colliderIndexCountUniform = uniform(indices.length);

  bvhRootsBuffer = instancedArray(bvhRoots, 'uint').setPBO(true);
  console.log("BvhRootsBuffer", bvhRootsBuffer)
  bvhBoundsBuffer = instancedArray(bvhBounds, 'float').setPBO(true);
  console.log("BvhBoundsBuffer", bvhBoundsBuffer)
  bvhIndexBuffer = instancedArray(new Uint16Array(bvhIndex), 'uint').setPBO(true);
  console.log("BvhIndexBuffer", bvhIndexBuffer)
  // correct: use the original Uint32Array and two‐component vectors
  bvhIndirectBuffer = instancedArray(
    bvhIndirect,   // the Uint32Array that MeshBVH.serialize() gave you
    'uvec2'        // exactly two children per interior node
  ).setPBO(true);
  console.log("BvhIndirectBuffer", bvhIndirectBuffer)
  const nodeCount = bvhBounds.length / 8;
  bvhNodeCountUniform = uniform(nodeCount);
  console.log("BvhNodeCountUniform", bvhNodeCountUniform)

  triCount = indices.length / 3;
  console.log("TriCount", triCount);

  debugBoundsFloatBuffer = instancedArray(new Float32Array(6), 'float')
    .setPBO(true);
  debugPosBuffer = instancedArray(new Float32Array(3), 'float')
    .setPBO(true);
}

export function setupComputeShaders(verletVertices, verletSprings) {
  const vCount = verletVertices.length;
  const sCount = verletSprings.length;
  const EPS = float(1e-6);

  // spring forces (unchanged) …
  computeSpringForces = Fn(() => {
    const sid = instanceIndex;
    const sv = springVertexIdBuffer.element(sid);
    const p0 = vertexPositionBuffer.element(sv.x);
    const p1 = vertexPositionBuffer.element(sv.y);
    const d = p1.sub(p0).toVar('d');
    const dist = d.length().max(EPS).toVar('dist');
    const baseRest = springRestLengthBuffer.element(sid);
    const isSeam = springSeamFlagBuffer.element(sid).equal(uint(1));
    const seamT = clamp(seamTightnessUniform, float(0), float(1));
    const rest = select(isSeam, baseRest.mul(float(1).sub(seamT)), baseRest).max(EPS);
    const delta = dist.sub(rest).toVar('delta');
    const doF = delta.abs().greaterThan(EPS);
    If(doF, () => {
      const f = d.mul(delta).mul(stiffnessUniform).mul(float(0.5)).div(dist).toVar('f');
      springForceBuffer.element(sid).assign(f);
    }).Else(() => {
      springForceBuffer.element(sid).assign(vec3(0));
    });
  })().compute(sCount);

  // clear collision for next frame (unchanged) …
  clearCollisionBuffers = Fn(() => {
    If(instanceIndex.equal(uint(0)), () => {
      // atomicStore(impactFlagBuffer.element(uint(0)), uint(0));
    });
    If(instanceIndex.lessThan(uint(vCount)), () => {
      collisionDepthBuffer.element(instanceIndex).assign(float(0));
      collisionProjBuffer.element(instanceIndex).assign(vec3(0));
    });
  })().compute(vCount);

  // **computeCollision** now uses BVH stack traversal:
  computeCollision = Fn(() => {
    const vid = instanceIndex;
    const P = vertexPositionBuffer.element(vid);

    debugPosBuffer.element(uint(0)).assign(P.x);
    debugPosBuffer.element(uint(1)).assign(P.y);
    debugPosBuffer.element(uint(2)).assign(P.z);
    // best‐so‐far for this vertex
    var bestD = float(0).toVar('bestD');
    var bestP = vec3(0).toVar('bestP');

    // build a true shader‐side array of zeros (length = MAX_DEPTH)
    const zeroList = new Array(MAX_DEPTH).fill(uint(0));
    const stack = array(zeroList);

    // one mutable pointer var
    const ptr = uint(0).toVar('ptr');

    // push the single root node (always at bvhRootsBuffer[0])
    stack.element(ptr).assign(bvhRootsBuffer.element(uint(0)));
    ptr.assign(ptr.add(uint(1)));

    // traverse until stack empty or depth limit reached
    Loop({
      start: uint(0), end: uint(MAX_DEPTH),
      type: 'uint', condition: '<'
    }, () => {
      If(ptr.greaterThan(uint(0)), () => {
        // pop
        ptr.assign(ptr.sub(uint(1)));
        const nodeIndex = stack.element(ptr);
        const base = nodeIndex.mul(uint(8)); // 8 floats per node

        // (optional) record which node we’re at for debugging:

        // load AABB
        const minX = bvhBoundsBuffer.element(base.add(0)),
          minY = bvhBoundsBuffer.element(base.add(1)),
          minZ = bvhBoundsBuffer.element(base.add(2));
        const maxX = bvhBoundsBuffer.element(base.add(3)),
          maxY = bvhBoundsBuffer.element(base.add(4)),
          maxZ = bvhBoundsBuffer.element(base.add(5));

        debugBoundsFloatBuffer.element(uint(0)).assign(minX);
        debugBoundsFloatBuffer.element(uint(1)).assign(minY);
        debugBoundsFloatBuffer.element(uint(2)).assign(minZ);
        debugBoundsFloatBuffer.element(uint(3)).assign(maxX);
        debugBoundsFloatBuffer.element(uint(4)).assign(maxY);
        debugBoundsFloatBuffer.element(uint(5)).assign(maxZ);

        // AABB test
        If(
          P.x.greaterThanEqual(minX).and(P.x.lessThanEqual(maxX))
            .and(P.z.greaterThanEqual(minY)).and(P.z.lessThanEqual(maxY))   // swapped
            .and(P.y.greaterThanEqual(minZ)).and(P.y.lessThanEqual(maxZ)),  // swapped
          () => {
            const off = bvhBoundsBuffer.element(base.add(6)).toUint();
            const count = bvhBoundsBuffer.element(base.add(7)).toUint();

            // interior? push children
            If(count.equal(uint(0)), () => {
              atomicStore(impactFlagBuffer.element(uint(0)), 5);
              // interior: left child is next node, right child is meta0
              const leftChild = nodeIndex.add(uint(1));
              const rightChild = bvhBoundsBuffer.element(base.add(6)).toUint();
              stack.element(ptr).assign(leftChild);
              ptr.assign(ptr.add(uint(1)));
              stack.element(ptr).assign(rightChild);
              ptr.assign(ptr.add(uint(1)));
            }, () => {
              atomicStore(impactFlagBuffer.element(uint(0)), 12);

              // leaf: test each triangle
              Loop({
                start: uint(0), end: count,
                type: 'uint', condition: '<'
              }, ({ i }) => {

                const tBase = off.add(i.mul(uint(3)));
                const i0 = bvhIndexBuffer.element(tBase),
                  i1 = bvhIndexBuffer.element(tBase.add(1)),
                  i2 = bvhIndexBuffer.element(tBase.add(2));
                const A = colliderPositionBuffer.element(i0);
                const B = colliderPositionBuffer.element(i1);
                const C = colliderPositionBuffer.element(i2);

                // plane‐collision + barycentric
                const e1 = B.sub(A).toVar('e1');
                const e2 = C.sub(A).toVar('e2');
                const N = e1.cross(e2).normalize().toVar('N');
                const vPA = P.sub(A).toVar('vPA');
                const distPlane = vPA.dot(N).toVar('distPlane');
                const MIN_DIST = float(-0.02);

                If(
                  distPlane.lessThan(float(0))
                    .and(distPlane.greaterThan(MIN_DIST)),
                  () => {
                    const proj = P.sub(N.mul(distPlane)).toVar('proj');
                    const v0 = e1, v1 = e2, v2 = proj.sub(A);
                    const d00 = v0.dot(v0), d01 = v0.dot(v1), d11 = v1.dot(v1);
                    const d20 = v2.dot(v0), d21 = v2.dot(v1);
                    const denom = d00.mul(d11).sub(d01.mul(d01)).toVar('den');
                    const vv = d11.mul(d20).sub(d01.mul(d21)).div(denom).toVar('vv');
                    const ww = d00.mul(d21).sub(d01.mul(d20)).div(denom).toVar('ww');
                    const uu = float(1).sub(vv).sub(ww);

                    If(
                      uu.greaterThanEqual(float(0))
                        .and(vv.greaterThanEqual(float(0)))
                        .and(uu.add(vv).lessThanEqual(float(1))),
                      () => {
                        const depth = distPlane.mul(float(-1)).toVar('depth');
                        If(depth.greaterThan(bestD), () => {
                          bestD.assign(depth);
                          bestP.assign(proj);
                        });
                      });
                  });
              });
            });
          });
      });
    });

    // write final collision results
    If(bestD.greaterThan(float(0)), () => {
      atomicStore(impactFlagBuffer.element(uint(0)), uint(1));
      collisionDepthBuffer.element(vid).assign(bestD);
      collisionProjBuffer.element(vid).assign(bestP);
    });
  })().compute(vCount);


  // remaining shaders unchanged …
  computeVertexForces = Fn(() => {
    const vid = instanceIndex;
    If(vid.greaterThanEqual(uint(vCount)), () => Return());
    If(vertexParamsBuffer.element(vid).x.greaterThan(uint(0)), () => Return());

    const pos = vertexPositionBuffer.element(vid).toVar('pos');
    let force = vec3(0).toVar('force');
    const end = vertexParamsBuffer.element(vid).z.add(
      vertexParamsBuffer.element(vid).y
    );

    // spring sum
    Loop({ start: vertexParamsBuffer.element(vid).z, end, type: 'uint', condition: '<' }, ({ i }) => {
      const sid = springListBuffer.element(i).toVar('sid');
      const f = springForceBuffer.element(sid);
      const sv = springVertexIdBuffer.element(sid);
      const sign = select(sv.x.equal(vid), 1.0, -1.0);
      force.addAssign(f.mul(sign));
    });

    // gravity & wind
    const gDyn = gravitybaseOffsetUniform.add(gravityAccelUniform.mul(time));
    force.y.subAssign(gDyn);
    const noise = triNoise3D(pos, 1, time).sub(0.2).mul(0.0002);
    force.x.addAssign(noise.mul(windUniform));
    force.z.addAssign(noise.mul(windUniform));

    let nextPos = pos.add(force);

    const depth = collisionDepthBuffer.element(vid);
    If(depth.greaterThan(float(0)), () => {
      const proj = collisionProjBuffer.element(vid);
      const Ndir = pos.sub(proj).normalize();
      const nextPos = proj.add(Ndir.mul(float(0.001)));
      const nComp = Ndir.mul(force.dot(Ndir));
      force = force.sub(nComp);
      vertexForceBuffer.element(vid).assign(force);
      vertexPositionBuffer.element(vid).assign(nextPos);
    }).Else(() => {
      vertexForceBuffer.element(vid).assign(force);
      vertexPositionBuffer.element(vid).assign(nextPos);
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
