import * as THREE from 'three';
import Delaunator from 'delaunator';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { attribute } from 'three/tsl';

import { loadConfig, patternData } from './config.js';
import { pointInPolygon } from './utils.js';
import * as Compute from './compute.js';

// — PARAMETERS —
const sphereRadius = 0.15;
const initialClothHeight = sphereRadius + 0.5;
const boundarySegments = 300;
const separationY = 0.2;
const params = {
  showWireframe: true,
  showSphere: true,
  wind: 0.0,
  stiffness: 0.5,
  sphereRadius
};

// — GLOBALS —
let renderer, scene, camera, controls;
let verletVertices = [], verletSprings = [], seamDebugPairs = [];
let clothMesh, clothMaterial, seamLines, sphere;
const clock = new THREE.Clock();
let timeSinceLastStep = 0, timestamp = 0, frameCount = 0;

// — ENTRY POINT —
init();
async function init() {
  await loadConfig();
  if (!patternData || patternData.patterns.length !== 2) {
    console.error('Need exactly two patterns');
    return;
  }

  // identify left vs right
  const ids0 = new Set(patternData.patterns[0].points.map(p => p.id));

  // [1] Sample & triangulate each half
  const halves = patternData.patterns.map(pat => {
    // bounds & normalize to [-0.5, +0.5]
    let minX = Infinity, maxX = -Infinity,
      minY = Infinity, maxY = -Infinity;
    pat.points.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const scl = 1 / Math.max(maxX - minX, maxY - minY);
    const norm = p => ({ x: (p.x - cx) * scl, y: (p.y - cy) * scl });

    // build a Shape
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
      } else {
        shape.lineTo(nB.x, nB.y);
      }
    }
    shape.lineTo(P0.x, P0.y);

    // sample boundary
    const boundary = shape.getSpacedPoints(boundarySegments);

    // bounding box
    let bbMinX = Infinity, bbMaxX = -Infinity,
      bbMinY = Infinity, bbMaxY = -Infinity;
    boundary.forEach(v => {
      bbMinX = Math.min(bbMinX, v.x);
      bbMaxX = Math.max(bbMaxX, v.x);
      bbMinY = Math.min(bbMinY, v.y);
      bbMaxY = Math.max(bbMaxY, v.y);
    });

    // interior grid
    const interior = [];
    for (let x = bbMinX; x <= bbMaxX; x += 0.02) {
      for (let y = bbMinY; y <= bbMaxY; y += 0.02) {
        if (pointInPolygon(x, y, boundary)) {
          interior.push({ x, y });
        }
      }
    }

    // Delaunay
    const pts2D = boundary.concat(interior);
    const coords = pts2D.map(p => [p.x, p.y]);
    const dela = Delaunator.from(coords);
    const idx = [];
    for (let i = 0; i < dela.triangles.length; i += 3) {
      const a = dela.triangles[i], b = dela.triangles[i + 1], c = dela.triangles[i + 2];
      const pa = pts2D[a], pb = pts2D[b], pc = pts2D[c];
      const mx = (pa.x + pb.x + pc.x) / 3, my = (pa.y + pb.y + pc.y) / 3;
      if (pointInPolygon(mx, my, boundary)) {
        idx.push(a, b, c);
      }
    }

    return { norm, boundary, pts2D, idx, original: pat.points };
  });

  // [2] Merge halves
  const Apts = halves[0].pts2D;
  const Bpts = halves[1].pts2D;
  const allPts = Apts.concat(Bpts);
  const idxA = halves[0].idx;
  const idxB = halves[1].idx.map(i => i + Apts.length);
  const globalIdx = idxA.concat(idxB);

  // two quaternions: 90° about X (to lay cloth flat) …
  const quatX = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    Math.PI / 2
  );
  // … and 180° about Z (to flip the second pattern)
  const quatY = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    Math.PI
  );
  verletVertices = allPts.map((p, i) => {
    const offsetY = initialClothHeight + (i < Apts.length ? -separationY : +separationY);
    const pos = new THREE.Vector3(p.x, offsetY, p.y);
    // if this is the second (right-hand) pattern, flip it 180° around Y
    if (i >= Apts.length) pos.applyQuaternion(quatY);
    // then tilt into the scene
    pos.applyQuaternion(quatX);
    return { id: i, position: pos, isFixed: 0, springIds: [] };
  });
  verletSprings = [];
  seamDebugPairs = [];

  // helper to add a spring
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

  // [4] structural springs
  for (let i = 0; i < globalIdx.length; i += 3) {
    addSpring(globalIdx[i], globalIdx[i + 1]);
    addSpring(globalIdx[i + 1], globalIdx[i + 2]);
    addSpring(globalIdx[i + 2], globalIdx[i]);
  }

  // [5] seam springs (stitch entire boundary, not just the end-points)
  const getBoundaryIndex = (pid, half) => {
    const po = half.original.find(p => p.id === pid);
    const np = half.norm(po);
    let best = 0, d2 = Infinity;
    half.boundary.forEach((v, i) => {
      const dd = (v.x - np.x) ** 2 + (v.y - np.y) ** 2;
      if (dd < d2) { d2 = dd; best = i; }
    });
    return best;
  };

  const getBoundarySequence = (start, end, N) => {
    const seqF = [], seqB = [];
    let cur = start;
    // forward
    do {
      seqF.push(cur);
      cur = (cur + 1) % N;
    } while (cur !== (end + 1) % N);
    // backward
    cur = start;
    do {
      seqB.push(cur);
      cur = (cur - 1 + N) % N;
    } while (cur !== (end - 1 + N) % N);
    return seqF.length <= seqB.length ? seqF : seqB;
  };

  for (const seam of patternData.seams) {
    const [aPair, bPair] = seam;
    const half0Pair = ids0.has(aPair[0]) ? aPair : bPair;
    const half1Pair = ids0.has(aPair[0]) ? bPair : aPair;

    const i0 = getBoundaryIndex(half0Pair[0], halves[0]);
    const i1 = getBoundaryIndex(half0Pair[1], halves[0]);
    const j0 = getBoundaryIndex(half1Pair[0], halves[1]);
    const j1 = getBoundaryIndex(half1Pair[1], halves[1]);

    let seq0 = getBoundarySequence(i0, i1, halves[0].boundary.length);
    let seq1 = getBoundarySequence(j0, j1, halves[1].boundary.length);

    // resample to same length
    const L = Math.max(seq0.length, seq1.length);
    const resample = (seq, T) =>
      Array.from({ length: T }, (_, k) =>
        seq[Math.floor(k * seq.length / T)]
      );
    if (seq0.length !== L) seq0 = resample(seq0, L);
    if (seq1.length !== L) seq1 = resample(seq1, L);

    for (let k = 0; k < L; k++) {
      const idx0 = seq0[k];
      const idx1 = seq1[k] + Apts.length; // offset into second half
      addSpring(idx0, idx1);
      seamDebugPairs.push([idx0, idx1]);
    }
  }

  console.log('ℹ️ total seam springs:', seamDebugPairs.length);

  // [6] GPU setup
  Compute.setupBuffers(verletVertices, verletSprings, seamDebugPairs);
  Compute.setupUniforms(params);
  Compute.setupComputeShaders(verletVertices, verletSprings);

  // [7] Cloth mesh
  const geom = new THREE.BufferGeometry();
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(globalIdx), 1));
  const vid = new Uint32Array(verletVertices.length).map((_, i) => i);
  geom.setAttribute('vertexId', new THREE.BufferAttribute(vid, 1));
  clothMaterial = new THREE.MeshPhysicalNodeMaterial({
    color: 0x204080,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0.3
  });
  clothMaterial.positionNode = Compute.vertexPositionBuffer.element(
    attribute('vertexId')
  );
  clothMesh = new THREE.Mesh(geom, clothMaterial);
  clothMesh.frustumCulled = false;

  // [8] seam debug lines
  const lineGeo = new THREE.BufferGeometry();
  const posArr = new Float32Array(seamDebugPairs.length * 6);
  seamDebugPairs.forEach(([i0, i1], k) => {
    const p0 = verletVertices[i0].position;
    const p1 = verletVertices[i1].position;
    posArr.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], k * 6);
  });
  lineGeo.setAttribute('position',
    new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage)
  );
  seamLines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({ color: 0xff0000 })
  );

  // [9] scene, lighting, controls, GUI
  renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 10);
  camera.position.set(-1.6, -0.1, -1.6);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 1;
  controls.maxDistance = 3;
  controls.target.set(0, -0.1, 0);
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dl = new THREE.DirectionalLight(0xffffff, 1);
  dl.position.set(1, 1, 1);
  scene.add(dl, clothMesh, seamLines);

  sphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(sphereRadius * 0.95, 4),
    new THREE.MeshStandardNodeMaterial()
  );
  scene.add(sphere);

  const gui = new GUI();
  gui.add(params, 'showWireframe').name('Wireframe');
  gui.add(params, 'showSphere').name('Show Sphere');
  gui.add(params, 'wind', 0, 2, 0.01).name('Wind');
  gui.add(params, 'stiffness', 0.1, 1, 0.01).name('Stiffness');
  gui.add({ reset: () => window.location.reload() }, 'reset').name('Reset');

  window.addEventListener('resize', onWindowResize);
  renderer.setAnimationLoop(render);
}

// — RENDER LOOP —
async function render() {
  const dt = Math.min(clock.getDelta(), 1 / 60);
  timeSinceLastStep += dt;
  const tStep = 1 / 300;
  while (timeSinceLastStep >= tStep) {
    timeSinceLastStep -= tStep;
    timestamp += tStep;

    sphere.position.set(
      Math.sin(timestamp * 2.1) * 0.1,
      0,
      Math.sin(timestamp * 0.8) * 0.1
    );
    Compute.spherePositionUniform.value.copy(sphere.position);
    Compute.windUniform.value = params.wind;
    Compute.stiffnessUniform.value = params.stiffness;
    Compute.seamTightnessUniform.value = Math.min(timestamp * 2.0, 1.0);

    await renderer.computeAsync(Compute.computeSpringForces);
    await renderer.computeAsync(Compute.computeVertexForces);
  }

  // update seam lines
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
    console.log(
      `Frame ${frameCount}:`,
      verletVertices[i0].position.toArray(),
      verletVertices[i1].position.toArray()
    );
  }

  clothMesh.material.wireframe = params.showWireframe;
  sphere.visible = params.showSphere;
  await renderer.renderAsync(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
