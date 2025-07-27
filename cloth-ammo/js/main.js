import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import Delaunator from 'delaunator';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { attribute } from 'three/tsl';

import { patternData } from './config.js';
import { pointInPolygon } from './utils.js';
import * as Compute from './compute.js';

import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
  MeshBVHHelper
} from 'three-mesh-bvh';
import { setPatternData } from './config.js';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

let physicsWorld = null, ammoManBody = null;

const initialClothHeight = 0.15 + 0.5;
const boundarySegments = 400;
const separationY = 0.2;
const params = {
  showWireframe: true,
  wind: 0.0,
  stiffness: 0.15,
  seamSpeed: 0.0,
  verticalBoost: 5.0,
  constraintIterations: 1
};

function buildBvhBounds(bvh) {
  const nodes = [];

  bvh.traverse((depth, isLeaf, boundingData, offsetOrSplit, count) => {
    nodes.push({
      isLeaf,
      boundingBox: new Float32Array(boundingData),
      triangleOffset: isLeaf ? offsetOrSplit : null,
      triangleCount: isLeaf ? count : null,
      splitAxis: isLeaf ? null : offsetOrSplit,
      rightChildIndex: null,
    });
  });

  const stack = [0];
  while (stack.length) {
    const index = stack.pop();
    const node = nodes[index];
    if (node.isLeaf) continue;

    const leftIndex = index + 1;
    let open = 1;
    let rightIndex = leftIndex;

    while (open > 0 && ++rightIndex < nodes.length) {
      if (nodes[rightIndex].isLeaf) open--;
      else open++;
    }

    node.rightChildIndex = rightIndex;
    stack.push(node.rightChildIndex);
    stack.push(leftIndex);
  }

  const buffer = new Float32Array(nodes.length * 8);
  nodes.forEach((node, i) => {
    const base = i * 8;
    buffer.set(node.boundingBox, base);
    if (node.isLeaf) {
      buffer[base + 6] = node.triangleOffset + 3;
      buffer[base + 7] = node.triangleCount;
    } else {
      buffer[base + 6] = node.splitAxis;
      buffer[base + 7] = node.rightChildIndex;
    }
  });

  return buffer;
}

export async function buildHumanBVH({ scene, geoms, physicsWorld, Compute }) {
  const merged = BufferGeometryUtils.mergeGeometries(geoms, false);
  merged.computeBoundsTree({ lazyGeneration: false, indirect: true });
  const bvh = merged.boundsTree;

  const colliderMesh = new THREE.Mesh(
    merged,
    new THREE.MeshBasicMaterial({ visible: false })
  );
  scene.add(colliderMesh);

  const helper = new MeshBVHHelper(colliderMesh, 7);
  helper.children
    .filter(c => c.isLineSegments)
    .forEach(line => {
      line.material.depthTest = false;
      line.material.transparent = true;
      line.material.opacity = 0.2;
    });
  scene.add(helper);
  helper.update();

  const positions = merged.attributes.position.array;
  let indices = merged.index ? merged.index.array : null;
  if (!indices) {
    const vc = positions.length / 3;
    indices = new Uint32Array(vc);
    for (let i = 0; i < vc; i++) indices[i] = i;
  }

  const triMesh = new Ammo.btTriangleMesh();
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const a = new Ammo.btVector3(
      positions[ia], positions[ia + 1], positions[ia + 2]
    );
    const b = new Ammo.btVector3(
      positions[ib], positions[ib + 1], positions[ib + 2]
    );
    const c = new Ammo.btVector3(
      positions[ic], positions[ic + 1], positions[ic + 2]
    );
    triMesh.addTriangle(a, b, c, true);
  }
  const shape = new Ammo.btBvhTriangleMeshShape(triMesh, true, true);
  const motionState = new Ammo.btDefaultMotionState();
  const rbInfo = new Ammo.btRigidBodyConstructionInfo(
    0, motionState, shape, new Ammo.btVector3(0, 0, 0)
  );
  const body = new Ammo.btRigidBody(rbInfo);
  physicsWorld.addRigidBody(body);

  const bvhBounds = buildBvhBounds(bvh);

  Compute.setupColliderBuffers({
    positions: merged.attributes.position.array,
    indices: new Uint32Array(indices),
    bvhBounds
  });

  return { body, helper, merged, positions, indices };
}

let renderer, scene, camera, controls;
let verletVertices = [], verletSprings = [], seamDebugPairs = [];
let clothMesh, clothMaterial, seamLines;
let initialVertexPositions = [];
const clock = new THREE.Clock();
let timeSinceLastStep = 0, timestamp = 0, frameCount = 0;

async function init() {
  if (!patternData || patternData.patterns.length !== 2) {
    console.error('No pattern data loaded. Please call window.setClothPattern(json) first.');
    return;
  }

  let globalIdx;

  function setupRenderer() {
    renderer = new THREE.WebGPURenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
  }

  function setupScene() {
    scene = new THREE.Scene();
  }

  function setupCameraControls() {
    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 10);
    camera.position.set(-1.6, -0.1, -1.6);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 1;
    controls.maxDistance = 3;
    controls.target.set(0, -0.1, 0);
    controls.update();
  }

  function setupLights() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dl = new THREE.DirectionalLight(0xffffff, 1);
    dl.position.set(1, 1, 1);
    scene.add(dl);
  }

  function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);
  }

  function computeHalves() {
    const ids0 = new Set(patternData.patterns[0].points.map(p => p.id));
    return patternData.patterns.map(pat => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      pat.points.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const scl = 1 / Math.max(maxX - minX, maxY - minY);
      const norm = p => ({ x: (p.x - cx) * scl, y: (p.y - cy) * scl });
      const shape = new THREE.Shape();
      const P0 = norm(pat.points[0]);
      shape.moveTo(P0.x, P0.y);
      for (let i = 1; i < pat.points.length; i++) {
        const A = pat.points[i - 1], B = pat.points[i];
        const nA = norm(A), nB = norm(B);
        const hasBez = (A.handleOut?.dx || A.handleOut?.dy) || (B.handleIn?.dx || B.handleIn?.dy);
        if (hasBez) {
          const cp1 = norm({ x: A.x + (A.handleOut?.dx || 0), y: A.y + (A.handleOut?.dy || 0) });
          const cp2 = norm({ x: B.x + (B.handleIn?.dx || 0), y: B.y + (B.handleIn?.dy || 0) });
          shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, nB.x, nB.y);
        } else {
          shape.lineTo(nB.x, nB.y);
        }
      }
      shape.lineTo(P0.x, P0.y);
      const boundary = shape.getSpacedPoints(boundarySegments);
      let bbMinX = Infinity, bbMaxX = -Infinity, bbMinY = Infinity, bbMaxY = -Infinity;
      boundary.forEach(v => {
        bbMinX = Math.min(bbMinX, v.x);
        bbMaxX = Math.max(bbMaxX, v.x);
        bbMinY = Math.min(bbMinY, v.y);
        bbMaxY = Math.max(bbMaxY, v.y);
      });
      const interior = [];
      for (let x = bbMinX; x <= bbMaxX; x += 0.015) {
        for (let y = bbMinY; y <= bbMaxY; y += 0.015) {
          if (pointInPolygon(x, y, boundary)) interior.push({ x, y });
        }
      }
      const pts2D = boundary.concat(interior);
      const dela = Delaunator.from(pts2D.map(p => [p.x, p.y]));
      const idx = [];
      for (let i = 0; i < dela.triangles.length; i += 3) {
        const a = dela.triangles[i], b = dela.triangles[i + 1], c = dela.triangles[i + 2];
        const pa = pts2D[a], pb = pts2D[b], pc = pts2D[c];
        const mx = (pa.x + pb.x + pc.x) / 3, my = (pa.y + pb.y + pc.y) / 3;
        if (pointInPolygon(mx, my, boundary)) idx.push(a, b, c);
      }
      return { norm, boundary, pts2D, idx, original: pat.points };
    });
  }

  function setupVerlet(halves) {
    const Apts = halves[0].pts2D, Bpts = halves[1].pts2D;
    const allPts = Apts.concat(Bpts);
    const globalIdxLocal = halves[0].idx.concat(halves[1].idx.map(i => i + Apts.length));
    const quatX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const quatY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
    verletVertices = allPts.map((p, i) => {
      const offsetY = initialClothHeight + (i < Apts.length ? -separationY : separationY);
      const pos = new THREE.Vector3(p.x, offsetY, p.y);
      if (i >= Apts.length) pos.applyQuaternion(quatY);
      pos.applyQuaternion(quatX);
      return { id: i, position: pos, isFixed: 0, springIds: [] };
    });

    initialVertexPositions = verletVertices.map(v => v.position.clone());

    verletSprings = [];
    seamDebugPairs = [];
    function addSpring(i0, i1) {
      const v0 = verletVertices[i0], v1 = verletVertices[i1];
      for (const sid of v0.springIds) {
        const sp = verletSprings[sid];
        if ((sp.v0 === i0 && sp.v1 === i1) || (sp.v0 === i1 && sp.v1 === i0)) return;
      }
      const sid = verletSprings.length;
      verletSprings.push({ v0: i0, v1: i1 });
      v0.springIds.push(sid);
      v1.springIds.push(sid);
    }
    for (let i = 0; i < globalIdxLocal.length; i += 3) {
      addSpring(globalIdxLocal[i], globalIdxLocal[i + 1]);
      addSpring(globalIdxLocal[i + 1], globalIdxLocal[i + 2]);
      addSpring(globalIdxLocal[i + 2], globalIdxLocal[i]);
    }
    function getBoundaryIndex(pid, half) {
      const po = half.original.find(p => p.id === pid);
      const np = half.norm(po);
      let best = 0, d2 = Infinity;
      half.boundary.forEach((v, i) => {
        const dd = (v.x - np.x) ** 2 + (v.y - np.y) ** 2;
        if (dd < d2) { d2 = dd; best = i; }
      });
      return best;
    }
    function getBoundarySequence(start, end, N) {
      const seqF = [], seqB = [];
      let cur = start;
      do { seqF.push(cur); cur = (cur + 1) % N; } while (cur !== (end + 1) % N);
      cur = start;
      do { seqB.push(cur); cur = (cur - 1 + N) % N; } while (cur !== (end - 1 + N) % N);
      return seqF.length <= seqB.length ? seqF : seqB;
    }
    const ids0 = new Set(halves[0].original.map(p => p.id));
    for (const seam of patternData.seams) {
      const [aPair, bPair] = seam;
      const half0 = ids0.has(aPair[0]) ? aPair : bPair;
      const half1 = ids0.has(aPair[0]) ? bPair : aPair;
      let seq0 = getBoundarySequence(getBoundaryIndex(half0[0], halves[0]), getBoundaryIndex(half0[1], halves[0]), halves[0].boundary.length);
      let seq1 = getBoundarySequence(getBoundaryIndex(half1[0], halves[1]), getBoundaryIndex(half1[1], halves[1]), halves[1].boundary.length);
      const L = Math.max(seq0.length, seq1.length);
      const resample = (seq, T) => Array.from({ length: T }, (_, k) => seq[Math.floor(k * seq.length / T)]);
      if (seq0.length !== L) seq0 = resample(seq0, L);
      if (seq1.length !== L) seq1 = resample(seq1, L);
      for (let k = 0; k < L; k++) {
        const i0 = seq0[k];
        const i1 = seq1[k] + Apts.length;
        addSpring(i0, i1);
        seamDebugPairs.push([i0, i1]);
      }
    }
    globalIdx = globalIdxLocal;
  }

  function createClothMesh() {
    const geom = new THREE.BufferGeometry();
    geom.setIndex(new THREE.BufferAttribute(new Uint32Array(globalIdx), 1));
    const vid = Uint32Array.from({ length: verletVertices.length }, (_, i) => i);
    geom.setAttribute('vertexId', new THREE.BufferAttribute(vid, 1));
    const nVerts = verletVertices.length;
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3));
    clothMaterial = new THREE.MeshPhysicalNodeMaterial({
      color: 0x204080,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0.3
    });
    clothMaterial.positionNode = Compute.vertexPositionBuffer.element(attribute('vertexId'));
    clothMesh = new THREE.Mesh(geom, clothMaterial);
    clothMesh.frustumCulled = false;
    scene.add(clothMesh);
  }

  function createSeamLines() {
    const lineGeo = new THREE.BufferGeometry();
    const posArr = new Float32Array(seamDebugPairs.length * 6);
    seamDebugPairs.forEach(([i0, i1], k) => {
      const p0 = verletVertices[i0].position;
      const p1 = verletVertices[i1].position;
      posArr.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], k * 6);
    });
    lineGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage));
    seamLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xff0000 }));
    scene.add(seamLines);
    seamLines.visible = false;
  }

  function setupGUI() {
    const gui = new GUI();
    gui.add(params, 'showWireframe').name('Wireframe');
    gui.add(params, 'wind', 0, 2, 0.01).name('Wind');
    gui.add(params, 'stiffness', 0.1, 1, 0.01).name('Stiffness');
    gui.add(params, 'seamSpeed', 0.1, 5, 0.1).name('Seam Speed');
    gui.add(params, 'verticalBoost', 1, 20, 0.1).name('Vertical Boost');
    gui.add(params, 'constraintIterations', 1, 10, 1)
      .name('Projection Passes');

    const debugFolder = gui.addFolder('Debug Info');
    debugFolder.add({ vertices: verletVertices.length }, 'vertices').name('Vertex Count').listen();
    debugFolder.add({ triangles: globalIdx.length / 3 }, 'triangles').name('Triangle Count').listen();
    debugFolder.add({ springs: verletSprings.length }, 'springs').name('Spring Count').listen();
    debugFolder.close();

    gui.add({
      reset: async () => {

        verletVertices.forEach((v, i) => {
          v.position.copy(initialVertexPositions[i]);
        });

        const posArr = new Float32Array(verletVertices.length * 3);
        verletVertices.forEach((v, i) => {
          posArr.set([v.position.x, v.position.y, v.position.z], i * 3);
        });

        const newBuffer = new Float32Array(posArr);
        Compute.vertexPositionBuffer.value.set(newBuffer);

        const forceArr = new Float32Array(verletVertices.length * 3);
        Compute.vertexForceBuffer.value.set(forceArr);

        timestamp = 0;

        console.log('Cloth reset to initial state');
      }
    }, 'reset').name('Reset Cloth');
    gui.add({ fullReset: () => window.location.reload() }, 'fullReset').name('Full Reset');
  }

  setupRenderer();
  setupScene();
  setupCameraControls();
  setupLights();
  setupEventListeners();
  setupPhysicsWorld();
  const halves = computeHalves();
  setupVerlet(halves);

  console.log(`Improved cloth mesh: ${verletVertices.length} vertices, ${globalIdx.length / 3} triangles, ${verletSprings.length} springs`);

  Compute.setupBuffers(verletVertices, verletSprings, seamDebugPairs);
  Compute.setupUniforms(params);

  //await loadHumanColliderAndInitCompute();

  // Dummy collider setup for when human is disabled
  // set position far away so it avoids collision with the cloth
  const dummyPositions = new Float32Array([4, 4, 4, 4, 4, 4, 4, 4, 4]);
  const dummyIndices = new Uint32Array([0, 1, 2]);
  const dummyBvhBounds = new Float32Array(8);
  Compute.setupColliderBuffers({
    positions: dummyPositions,
    indices: dummyIndices,
    bvhBounds: dummyBvhBounds
  });

  // Visualization of dummy collider
  const dummyGeo = new THREE.BufferGeometry();
  dummyGeo.setAttribute('position', new THREE.BufferAttribute(dummyPositions, 3));
  dummyGeo.setIndex(new THREE.BufferAttribute(dummyIndices, 1));

  const dummyMat = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
    depthTest: false
  });

  const dummyMesh = new THREE.Mesh(dummyGeo, dummyMat);
  scene.add(dummyMesh);
  Compute.setupComputeShaders(verletVertices, verletSprings);
  createClothMesh();
  createSeamLines();
  //setupGUI();
  renderer.setAnimationLoop(render);
}

// Load the json throug the webview
window.setClothPattern = async function (json) {
  try {
    setPatternData(json);

    scene.clear();
    verletVertices.length = 0;
    verletSprings.length = 0;
    seamDebugPairs.length = 0;

    await init();
  } catch (err) {
    console.error('Invalid pattern JSON or error during init:', err);
  }
};
console.log("test message")
// for the 3D viewer to receive messages from the parent window
window.addEventListener('message', (event) => {
  console.log("du hs")
  if (event.data?.type === 'setClothPattern') {
    if (typeof window.setClothPattern === 'function') {
      window.setClothPattern(event.data.payload);
    } else {
      console.warn('setClothPattern not defined yet');
    }
  }
});


THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

async function loadHumanColliderAndInitCompute() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      './models/man.glb',
      async (gltf) => {

        gltf.scene.scale.set(0.25, 0.25, 0.25);
        gltf.scene.position.set(0, -0.8, 0);
        gltf.scene.updateMatrixWorld(true);

        const geoms = [];
        gltf.scene.traverse(o => {
          if (o.isMesh && o.geometry) {
            const g = o.geometry.clone();
            g.applyMatrix4(o.matrixWorld);
            geoms.push(g);
          }
        });

        const { body: ammoManBody, helper: manBVHHelper,
          merged, positions, indices } = await buildHumanBVH({
            scene, geoms, physicsWorld, Compute
          });

        const colliderGeo = new THREE.BufferGeometry();
        colliderGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        colliderGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        const colliderMat = new THREE.MeshBasicMaterial({
          color: 0x00ff00, wireframe: true, opacity: 0.3, transparent: true
        });
        scene.add(new THREE.Mesh(colliderGeo, colliderMat));

        const debugMat = new THREE.MeshBasicMaterial({
          wireframe: true, opacity: 0.3, transparent: true
        });
        scene.add(new THREE.Mesh(merged, debugMat));

        resolve();
      },
      undefined,
      err => reject(err)
    );
  });
}

function setupPhysicsWorld() {
  const cfg = new Ammo.btDefaultCollisionConfiguration();
  const disp = new Ammo.btCollisionDispatcher(cfg);
  const bp = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();
  physicsWorld = new Ammo.btDiscreteDynamicsWorld(disp, bp, solver, cfg);
  physicsWorld.setGravity(new Ammo.btVector3(0, -9.81, 0));
}

async function render() {
  const dt = Math.min(clock.getDelta(), 1 / 60);
  timeSinceLastStep += dt;
  const tStep = 1 / 240;
  while (timeSinceLastStep >= tStep) {
    timeSinceLastStep -= tStep;
    timestamp += tStep;

    Compute.windUniform.value = params.wind;
    Compute.stiffnessUniform.value = params.stiffness;
    Compute.seamTightnessUniform.value = Math.min(timestamp * params.seamSpeed, 1.0);

    await renderer.computeAsync(Compute.clearCollisionBuffers);

    await renderer.computeAsync(Compute.computeSpringForces);

    await renderer.computeAsync(Compute.computeCollision);

    await renderer.computeAsync(Compute.computeVertexForces);

    await renderer.computeAsync(Compute.computeSeamMomentumKill);

    // iterate length+seam constraints several times
    for (let i = 0; i < params.constraintIterations; i++) {
      await renderer.computeAsync(Compute.computeLengthProjection);
      await renderer.computeAsync(Compute.computeSeamProjection);
    }

    {
      const posAttr = clothMesh.geometry.attributes.position;
      for (let [i0, i1] of seamDebugPairs) {
        // read both vertex positions
        const x0 = posAttr.getX(i0), y0 = posAttr.getY(i0), z0 = posAttr.getZ(i0);
        const x1 = posAttr.getX(i1), y1 = posAttr.getY(i1), z1 = posAttr.getZ(i1);
        // compute midpoint
        const mx = 0.5 * (x0 + x1), my = 0.5 * (y0 + y1), mz = 0.5 * (z0 + z1);
        // write both vertices to the midpoint
        posAttr.setXYZ(i0, mx, my, mz);
        posAttr.setXYZ(i1, mx, my, mz);
      }
      posAttr.needsUpdate = true;
    }
  }

  {
    const attr = seamLines.geometry.attributes.position;
    const arr = attr.array;
    seamDebugPairs.forEach(([i0, i1], k) => {
      const off = k * 6;
      const p0 = verletVertices[i0].position, p1 = verletVertices[i1].position;
      arr[off + 0] = p0.x; arr[off + 1] = p0.y; arr[off + 2] = p0.z;
      arr[off + 3] = p1.x; arr[off + 4] = p1.y; arr[off + 5] = p1.z;
    });
    attr.needsUpdate = true;
  }

  frameCount++;
  if (frameCount % 60 === 0) {
    const [i0, i1] = seamDebugPairs[0];

  }

  clothMesh.material.wireframe = params.showWireframe;



  await renderer.renderAsync(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}