import {
  Fn, If, Return, instancedArray, instanceIndex,
  uniform, attribute, select, uint, Loop,
  float, triNoise3D, time
} from 'three/tsl';
import * as THREE from 'three';

export let stiffnessUniform, windUniform,
           spherePositionUniform, sphereUniform, sphereRadiusUniform,
           dampingUniform,
           gravityBaseUniform, gravityAccelUniform;

// (Re)initialize shared uniforms for each cloth
export function setupUniforms(params) {
  stiffnessUniform      = uniform(params.stiffness);
  windUniform           = uniform(params.wind);
  spherePositionUniform = uniform(new THREE.Vector3());
  sphereUniform         = uniform(1.0);
  sphereRadiusUniform   = uniform(params.sphereRadius);
  dampingUniform        = uniform(0.98);
  gravityBaseUniform    = uniform(0.00007);
  gravityAccelUniform   = uniform(0.000002);
}

/**
 * Build GPU buffers + compute shaders for one cloth patch.
 * @param {Array} verts    Array of Verlet‐vertex objects ({ id, position:Vector3, isFixed, springIds })
 * @param {Array} springs  Array of spring objects ({ vertex0, vertex1, id })
 * @param {Object} params  { stiffness, wind, sphereRadius, … }
 */
export function createClothCompute(verts, springs, params) {
  setupUniforms(params);

  // ——— vertex buffers ——————————————————
  const n = verts.length;
  const posArr   = new Float32Array(n * 3);
  const paramArr = new Uint32Array(n * 3);
  const springList = [];
  verts.forEach((v, i) => {
    posArr[i*3]   = v.position.x;
    posArr[i*3+1] = v.position.y;
    posArr[i*3+2] = v.position.z;
    paramArr[i*3]   = v.isFixed;
    paramArr[i*3+1] = v.springIds.length;
    paramArr[i*3+2] = springList.length;
    springList.push(...v.springIds);
  });
  const vertexPositionBuffer = instancedArray(posArr,   'vec3').setPBO(true);
  const vertexForceBuffer    = instancedArray(n,        'vec3');
  const vertexParamsBuffer   = instancedArray(paramArr, 'uvec3');
  const springListBuffer     = instancedArray(new Uint32Array(springList), 'uint').setPBO(true);

  // ——— spring buffers ——————————————————
  const m = springs.length;
  const idArr   = new Uint32Array(m * 2);
  const restArr = new Float32Array(m);
  springs.forEach((s, i) => {
    idArr[i*2]   = s.vertex0.id;
    idArr[i*2+1] = s.vertex1.id;
    restArr[i]   = s.vertex0.position.distanceTo(s.vertex1.position);
  });
  const springVertexIdBuffer   = instancedArray(idArr,   'uvec2').setPBO(true);
  const springRestLengthBuffer = instancedArray(restArr, 'float');
  const springForceBuffer      = instancedArray(m * 3,  'vec3').setPBO(true);

  // ——— computeSpringForces ——————————————————
  const computeSpringForces = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(m)), () => Return());
    const vid  = springVertexIdBuffer.element(instanceIndex);
    const rest = springRestLengthBuffer.element(instanceIndex);
    const p0   = vertexPositionBuffer.element(vid.x);
    const p1   = vertexPositionBuffer.element(vid.y);
    const d    = p1.sub(p0).toVar();
    const dist = d.length().max(0.000001).toVar();
    const f    = dist.sub(rest)
                     .mul(stiffnessUniform)
                     .mul(d)
                     .mul(0.5)
                     .div(dist);
    springForceBuffer.element(instanceIndex).assign(f);
  })().compute(m);

  // ——— computeVertexForces ——————————————————
  const computeVertexForces = Fn(() => {
    If(instanceIndex.greaterThanEqual(uint(n)), () => Return());
    const param = attribute('vertexParams').element(instanceIndex).toVar();
    If(param.x.greaterThan(0), () => Return());
    let pos   = vertexPositionBuffer.element(instanceIndex).toVar('pos');
    let force = vertexForceBuffer.element(instanceIndex).toVar('force');
    force.mulAssign(dampingUniform);

    // springs
    const end = param.z.add(param.y).toVar('end');
    Loop({ start: param.z, end, type: 'uint', condition: '<' }, ({ i }) => {
      const sid = springListBuffer.element(i).toVar();
      const sf  = springForceBuffer.element(sid);
      const sv  = springVertexIdBuffer.element(sid);
      const sign = select(sv.x.equal(instanceIndex), 1.0, -1.0);
      force.addAssign(sf.mul(sign));
    });

    // gravity & wind
    const gDyn = gravityAccelUniform.mul(time).add(gravityBaseUniform);
    force.y.subAssign(gDyn);
    const nse = triNoise3D(pos, 1, time).sub(0.2).mul(0.0002);
    force.x.addAssign(nse.mul(windUniform));
    force.z.addAssign(nse.mul(windUniform));

    // sphere collision
    let nextPos = pos.add(force).toVar('nextPos');
    const dir  = nextPos.sub(spherePositionUniform).toVar('dir');
    const dist = dir.length().toVar('dist');
    If(dist.lessThan(sphereRadiusUniform), () => {
      const nDir  = dir.div(dist);
      nextPos.assign(
        spherePositionUniform.add(nDir.mul(sphereRadiusUniform))
      );
      const v     = nextPos.sub(pos);
      const speed = v.length();
      const rest  = select(
        speed.greaterThan(float(0.005)),
        float(1.2),
        float(0.8)
      );
      force.assign(v.mul(rest));
    });

    vertexForceBuffer.element(instanceIndex).assign(force);
    vertexPositionBuffer.element(instanceIndex).assign(nextPos);
  })().compute(n);

  return {
    vertexPositionBuffer,
    vertexForceBuffer,
    vertexParamsBuffer,
    springListBuffer,
    springVertexIdBuffer,
    springRestLengthBuffer,
    springForceBuffer,
    computeSpringForces,
    computeVertexForces
  };
}
