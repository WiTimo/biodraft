// js/main.js

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import Delaunator from 'delaunator';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { attribute } from 'three/tsl';

import { computeBoundsTree, acceleratedRaycast, MeshBVHHelper } from 'three-mesh-bvh';

import { loadConfig, patternData } from './config.js';
import { pointInPolygon } from './utils.js';
import * as Compute from './compute.js';

// Hook BVH into Three.js
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// — PARAMETERS —
const sphereRadius = 0.15;
const initialClothHeight = sphereRadius + 0.5;
const boundarySegments = 300;
const separationY = 0.2;
const params = {
  showWireframe: true,
  wind: 0.0,
  stiffness: 0.5,
  sphereRadius
};

// — GLOBALS —
let renderer, scene, camera, controls;
let verletVertices = [], verletSprings = [], seamDebugPairs = [];
let clothMesh, clothMaterial, seamLines;
const clock = new THREE.Clock();
let timeSinceLastStep = 0, timestamp = 0;
let manMesh = null;

init();
async function init() {
  await loadConfig();
  if (!patternData || patternData.patterns.length !== 2) {
    console.error('Need exactly two patterns');
    return;
  }

  // [1] Sample & triangulate each half
  const ids0 = new Set(patternData.patterns[0].points.map(p => p.id));
  const halves = patternData.patterns.map(pat => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pat.points.forEach(p => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
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
      const hasBez = (A.handleOut.dx || A.handleOut.dy) || (B.handleIn.dx || B.handleIn.dy);
      if (hasBez) {
        const cp1 = norm({ x: A.x + (A.handleOut.dx || 0), y: A.y + (A.handleOut.dy || 0) });
        const cp2 = norm({ x: B.x + (B.handleIn.dx || 0), y: B.y + (B.handleIn.dy || 0) });
        shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, nB.x, nB.y);
      } else shape.lineTo(nB.x, nB.y);
    }
    shape.lineTo(P0.x, P0.y);
    const boundary = shape.getSpacedPoints(boundarySegments);

    let bbMinX = Infinity, bbMaxX = -Infinity, bbMinY = Infinity, bbMaxY = -Infinity;
    boundary.forEach(v => {
      bbMinX = Math.min(bbMinX, v.x); bbMaxX = Math.max(bbMaxX, v.x);
      bbMinY = Math.min(bbMinY, v.y); bbMaxY = Math.max(bbMaxY, v.y);
    });

    const interior = [];
    for (let x = bbMinX; x <= bbMaxX; x += 0.02) {
      for (let y = bbMinY; y <= bbMaxY; y += 0.02) {
        if (pointInPolygon(x, y, boundary)) interior.push({ x, y });
      }
    }

    const pts2D = boundary.concat(interior);
    const coords = pts2D.map(p => [p.x, p.y]);
    const dela = Delaunator.from(coords);
    const idx = [];
    for (let i = 0; i < dela.triangles.length; i += 3) {
      const a = dela.triangles[i], b = dela.triangles[i + 1], c = dela.triangles[i + 2];
      const pa = pts2D[a], pb = pts2D[b], pc = pts2D[c];
      const mx = (pa.x + pb.x + pc.x) / 3, my = (pa.y + pb.y + pc.y) / 3;
      if (pointInPolygon(mx, my, boundary)) idx.push(a, b, c);
    }
    return { norm, boundary, pts2D, idx, original: pat.points };
  });

  // [2] Merge halves
  const Apts = halves[0].pts2D, Bpts = halves[1].pts2D;
  const allPts = Apts.concat(Bpts);
  const idxA = halves[0].idx;
  const idxB = halves[1].idx.map(i => i + Apts.length);
  const globalIdx = idxA.concat(idxB);

  const quatX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const quatY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);

  verletVertices = allPts.map((p, i) => {
    const yOff = initialClothHeight + (i < Apts.length ? -separationY : +separationY);
    const pos = new THREE.Vector3(p.x, yOff, p.y);
    if (i >= Apts.length) pos.applyQuaternion(quatY);
    pos.applyQuaternion(quatX);
    return { id: i, position: pos, isFixed: 0, springIds: [] };
  });
  verletSprings = []; seamDebugPairs = [];

  function addSpring(i0, i1) {
    const v0 = verletVertices[i0], v1 = verletVertices[i1];
    if (v0.springIds.some(sid => {
      const sp = verletSprings[sid];
      return (sp.v0 === i0 && sp.v1 === i1) || (sp.v0 === i1 && sp.v1 === i0);
    })) return;
    const sid = verletSprings.length;
    verletSprings.push({ v0: i0, v1: i1 });
    v0.springIds.push(sid); v1.springIds.push(sid);
  }

  // [4] structural
  for (let i = 0; i < globalIdx.length; i += 3) {
    addSpring(globalIdx[i], globalIdx[i + 1]);
    addSpring(globalIdx[i + 1], globalIdx[i + 2]);
    addSpring(globalIdx[i + 2], globalIdx[i]);
  }

  // [5] seams
  const getIdx = (pid, half) => {
    const po = half.original.find(p => p.id === pid), np = half.norm(po);
    let best = 0, d2 = Infinity;
    half.boundary.forEach((v, i) => {
      const dd = (v.x - np.x) ** 2 + (v.y - np.y) ** 2;
      if (dd < d2) { d2 = dd; best = i; }
    });
    return best;
  };
  const seqFn = (s, e, N) => {
    const f = [], b = []; let c = s;
    do { f.push(c); c = (c + 1) % N; } while (c !== (e + 1) % N);
    c = s;
    do { b.push(c); c = (c - 1 + N) % N; } while (c !== (e - 1 + N) % N);
    return f.length <= b.length ? f : b;
  };
  const resamp = (s, T) => Array.from({ length: T }, (_, k) => s[Math.floor(k * s.length / T)]);

  for (const seam of patternData.seams) {
    const [a, b] = seam;
    const half0 = ids0.has(a[0]) ? a : b;
    const half1 = ids0.has(a[0]) ? b : a;
    let s0 = seqFn(getIdx(half0[0], halves[0]), getIdx(half0[1], halves[0]), halves[0].boundary.length);
    let s1 = seqFn(getIdx(half1[0], halves[1]), getIdx(half1[1], halves[1]), halves[1].boundary.length);
    const L = Math.max(s0.length, s1.length);
    if (s0.length !== L) s0 = resamp(s0, L);
    if (s1.length !== L) s1 = resamp(s1, L);
    for (let k = 0; k < L; k++) {
      const i0 = s0[k], i1 = s1[k] + Apts.length;
      addSpring(i0, i1);
      seamDebugPairs.push([i0, i1]);
    }
  }

  // [6] GPU setup
  Compute.setupBuffers(verletVertices, verletSprings, seamDebugPairs);
  Compute.setupUniforms(params);
  Compute.setupComputeShaders(verletVertices, verletSprings);

  // [7] Cloth mesh
  const geom = new THREE.BufferGeometry();
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(globalIdx), 1));
  // **NEW** cpu‐side position attribute
  const cpuPos = new Float32Array(verletVertices.length * 3);
  verletVertices.forEach((v, i) => {
    cpuPos[i * 3] = v.position.x;
    cpuPos[i * 3 + 1] = v.position.y;
    cpuPos[i * 3 + 2] = v.position.z;
  });
  geom.setAttribute('position', new THREE.BufferAttribute(cpuPos, 3));

  const vid = new Uint32Array(verletVertices.length).map((_, i) => i);
  geom.setAttribute('vertexId', new THREE.BufferAttribute(vid, 1));

  clothMaterial = new THREE.MeshPhysicalNodeMaterial({
    color: 0x204080, side: THREE.DoubleSide, roughness: 1, metalness: 0.3
  });
  clothMaterial.positionNode = Compute.vertexPositionBuffer.element(attribute('vertexId'));

  clothMesh = new THREE.Mesh(geom, clothMaterial);
  clothMesh.frustumCulled = false;

  // [8] seam debug
  const lineGeo = new THREE.BufferGeometry();
  const arr = new Float32Array(seamDebugPairs.length * 6);
  seamDebugPairs.forEach(([i0, i1], k) => {
    const p0 = verletVertices[i0].position, p1 = verletVertices[i1].position;
    arr.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], k * 6);
  });
  lineGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3).setUsage(THREE.DynamicDrawUsage));
  seamLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xff0000 }));

  // [9] scene & GUI
  renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 10);
  camera.position.set(-1.6, -0.1, -1.6);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 1; controls.maxDistance = 3;
  controls.target.set(0, -0.1, 0); controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dl = new THREE.DirectionalLight(0xffffff, 1);
  dl.position.set(1, 1, 1);
  scene.add(dl, clothMesh, seamLines);

  // load BVH mesh
  const loader2 = new GLTFLoader();
  loader2.load('./models/man.glb', gltf => {
    const man = gltf.scene;
    man.scale.set(0.25, 0.25, 0.25);
    man.position.set(0, -0.8, 0);
    scene.add(man);
    man.traverse(ch => {
      if (ch.isMesh) {
        ch.geometry.computeBoundsTree();
        manMesh = ch;

        // …and now visualize it:
        const bvhHelper = new MeshBVHHelper(ch, 10);
        bvhHelper.visible = true;   // turn it on
        scene.add(bvhHelper);

        // optional: toggle via GUI
        gui.add({ showBVH: true }, 'showBVH')
          .name('Show BVH')
          .onChange(v => bvhHelper.visible = v);
      }
    });
  });

  const gui = new GUI();
  gui.add(params, 'showWireframe').name('Wireframe');
  gui.add(params, 'wind', 0, 2, 0.01).name('Wind');
  gui.add(params, 'stiffness', 0.1, 1, 0.01).name('Stiffness');
  gui.add({ reset: () => window.location.reload() }, 'reset').name('Reset');

  window.addEventListener('resize', onWindowResize);
  renderer.setAnimationLoop(render);
}

async function render() {
  const dt = Math.min(clock.getDelta(), 1 / 60);
  timeSinceLastStep += dt;
  const tStep = 1 / 300;
  while (timeSinceLastStep >= tStep) {
    timeSinceLastStep -= tStep; timestamp += tStep;
    Compute.windUniform.value = params.wind;
    Compute.stiffnessUniform.value = params.stiffness;
    Compute.seamTightnessUniform.value = Math.min(timestamp * 2, 1);
    await renderer.computeAsync(Compute.computeSpringForces);
    await renderer.computeAsync(Compute.computeVertexForces);
  }

  // update seams
  const aAtt = seamLines.geometry.attributes.position;
  const aArr = aAtt.array;
  seamDebugPairs.forEach(([i0, i1], k) => {
    const off = k * 6;
    const p0 = verletVertices[i0].position;
    const p1 = verletVertices[i1].position;
    aArr[off] = p0.x; aArr[off + 1] = p0.y; aArr[off + 2] = p0.z;
    aArr[off + 3] = p1.x; aArr[off + 4] = p1.y; aArr[off + 5] = p1.z;
  });
  aAtt.needsUpdate = true;

  clothMesh.material.wireframe = params.showWireframe;

  // BVH collision → update cpu‐side position attribute
  if (manMesh) {
    const posAtt = clothMesh.geometry.attributes.position;
    const arr = posAtt.array;
    const tmp = new THREE.Vector3(), cp = new THREE.Vector3();
    for (let i = 0; i < arr.length; i += 3) {
      tmp.set(arr[i], arr[i + 1], arr[i + 2]);
      manMesh.geometry.boundsTree.closestPointToPoint(tmp, cp);
      arr[i] = cp.x;
      arr[i + 1] = cp.y;
      arr[i + 2] = cp.z;
    }
    posAtt.needsUpdate = true;
  }

  await renderer.renderAsync(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
