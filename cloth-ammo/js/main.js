import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { attribute } from 'three/tsl';

import { loadConfig, patternData } from './config.js';
import { setupVerletFromPattern } from './verlet.js';
import * as Compute from './compute.js';

const sphereRadius = 0.15;
const initialClothHeight = sphereRadius + 0.5;
const boundarySegments = 800;

const params = {
  showWireframe: true,
  showSphere: true,
  wind: 0.0,
  stiffness: 0.5,
  sphereRadius: sphereRadius
};

let renderer, scene, camera, controls;
let sphere;
const clock = new THREE.Clock();
let timeSinceLastStep = 0, timestamp = 0;

// Arrays to hold multiple cloths
const cloths = [];

init();

async function init() {
  await loadConfig();
  if (!patternData.patterns) {
    console.error('No pattern data');
    return;
  }

  // ——— three.js boilerplate ——————————————————
  renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 10);
  camera.position.set(-1.6, -0.1, -1.6);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 1;
  controls.maxDistance = 3;
  controls.target.set(0, -0.1, 0);
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(1, 1, 1);
  scene.add(dir);

  // ——— Loop through patterns ——————————————————
  patternData.patterns.forEach((pat, index) => {
    const res = setupVerletFromPattern(pat, boundarySegments, initialClothHeight);
    if (!res) {
      console.warn(`Pattern ${index} setup failed`);
      return;
    }

    // ——— compute pipeline setup ——————————————————
    const clothCompute = Compute.createClothCompute(res.vertices, res.springs, params);

    // ——— build cloth mesh ——————————————————
    const geom = new THREE.BufferGeometry();
    geom.setIndex(new THREE.BufferAttribute(res.indices, 1));

    const vid = new Uint32Array(res.vertices.length);
    for (let i = 0; i < res.vertices.length; i++) vid[i] = i;
    geom.setAttribute('vertexId', new THREE.BufferAttribute(vid, 1, false));

    const clothMaterial = new THREE.MeshPhysicalNodeMaterial({
      color: new THREE.Color().setHSL(index / patternData.patterns.length, 0.7, 0.5),
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0.3
    });
    clothMaterial.positionNode = clothCompute.vertexPositionBuffer.element(
      attribute('vertexId')
    );

    const clothMesh = new THREE.Mesh(geom, clothMaterial);
    clothMesh.frustumCulled = false;
    scene.add(clothMesh);

    // Store in cloths array
    cloths.push({
      verletVertices: res.vertices,
      initialPositions: res.initialPositions,
      springs: res.springs,
      clothCompute,
      clothMaterial,
      clothMesh
    });
  });

  // ——— sphere ——————————————————
  const sphereGeo = new THREE.IcosahedronGeometry(sphereRadius * 0.95, 4);
  sphere = new THREE.Mesh(sphereGeo, new THREE.MeshStandardNodeMaterial());
  scene.add(sphere);

  // ——— GUI ——————————————————
  const gui = new GUI();
  gui.add(params, 'showWireframe').name('Wireframe');
  gui.add(params, 'showSphere').name('Show Sphere');
  gui.add(params, 'wind', 0, 2, 0.01).name('Wind');
  gui.add(Compute.stiffnessUniform, 'value', 0.1, 1, 0.01).name('Stiffness');
  gui.add(Compute.gravityBaseUniform, 'value', 0, 0.001, 1e-5).name('g base');
  gui.add(Compute.gravityAccelUniform, 'value', 0, 1e-5, 1e-7).name('g accel');
  gui.add({ resetSimulation }, 'resetSimulation').name('Reset');

  window.addEventListener('resize', onWindowResize);
  renderer.setAnimationLoop(render);
}

function resetSimulation() {
  clock.start();
  timeSinceLastStep = 0;
  timestamp = 0;

  sphere.position.set(0, 0, 0);
  Compute.spherePositionUniform.value.copy(sphere.position);

  cloths.forEach((cloth) => {
    cloth.verletVertices.forEach((v, i) => {
      v.position.copy(cloth.initialPositions[i]);
    });
    cloth.clothCompute = Compute.createClothCompute(cloth.verletVertices, cloth.springs, params);
    cloth.clothMaterial.positionNode = cloth.clothCompute.vertexPositionBuffer.element(
      attribute('vertexId')
    );
  });
}

async function render() {
  cloths.forEach((cloth) => {
    cloth.clothMaterial.wireframe = params.showWireframe;
  });
  sphere.visible = params.showSphere;
  Compute.sphereUniform.value = params.showSphere ? 1 : 0;

  const dt = Math.min(clock.getDelta(), 1 / 60);
  timeSinceLastStep += dt;
  const tStep = 1 / 300;
  while (timeSinceLastStep >= tStep) {
    timestamp += tStep;
    timeSinceLastStep -= tStep;

    sphere.position.set(
      Math.sin(timestamp * 2.1) * 0.1,
      0,
      Math.sin(timestamp * 0.8) * 0.1
    );
    Compute.spherePositionUniform.value.copy(sphere.position);
    Compute.windUniform.value = params.wind;
    Compute.stiffnessUniform.value = params.stiffness;

    for (const cloth of cloths) {
      await renderer.computeAsync(cloth.clothCompute.computeSpringForces);
      await renderer.computeAsync(cloth.clothCompute.computeVertexForces);
    }
  }

  await renderer.renderAsync(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
