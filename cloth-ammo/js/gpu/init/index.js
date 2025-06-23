// File: js/init/index.js

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BufferGeometry, BufferAttribute } from 'three';
import { initRenderer }                   from './sceneSetup.js';
import { loadModelTriData }               from './modelLoader.js';
import { setupGPU }                       from './gpuSetup.js';

export async function init() {
  // 1) Renderer & WebGPU device
  const { renderer, device } = await initRenderer();

  // 2) Scene & camera
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.01,
    10
  );
  camera.position.set(0, 1, 2);

  // 3) Orbit controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.update();

  // 4) Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  scene.add(new THREE.DirectionalLight(0xffffff, 1));

  // 5) Load the merged, scaled triangle data for the model
  const triData = await loadModelTriData();

  // 6) **Visualize** that same triangle data as a Mesh so you can *see* the model
  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(triData, 3));
  geom.computeVertexNormals();
  const modelMesh = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide })
  );
  scene.add(modelMesh);

  // 7) Sphere‐collision params
  const params = {
    sphereRadius:   0.15,
    spherePosition: new THREE.Vector3(0, 1.5, 0)
  };

  // 8) GPU setup (naive all‐triangles collision)
  const { spherePosBinding } = await setupGPU(renderer, device, params, triData);

  // 9) Create & add your visible sphere
  const sphereVel  = new THREE.Vector3(0, 0, 0);
  const sphereMesh = new THREE.Mesh(
    new THREE.SphereGeometry(params.sphereRadius, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0xff0000 })
  );
  sphereMesh.position.copy(params.spherePosition);
  scene.add(sphereMesh);

  // 10) Handle resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    renderer,
    device,
    scene,
    camera,
    controls,
    sphereMesh,
    sphereVel,
    spherePosBinding
  };
}
