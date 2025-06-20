import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

export async function initRenderer() {
  // 1) Request the GPU adapter + device manually:
  if (!navigator.gpu) {
    throw new Error('WebGPU not supported in this browser');
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('Failed to get GPU adapter');
  }
  const device = await adapter.requestDevice();

  // 2) Create the Three.js WebGPURenderer, passing in our device:
  const renderer = new THREE.WebGPURenderer({ antialias: true, device });
  // 3) Standard setup
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Return both renderer and the raw device
  return { renderer, device };
}

export function initScene(renderer, clothMesh, seamLines, params) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    40, window.innerWidth / window.innerHeight, 0.01, 10
  );
  camera.position.set(-1.6, -0.1, -1.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 1;
  controls.maxDistance = 3;
  controls.target.set(0, -0.1, 0);
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dl = new THREE.DirectionalLight(0xffffff, 1);
  dl.position.set(1, 1, 1);
  scene.add(dl, clothMesh, seamLines);

  const gui = new GUI();
  gui.add(params, 'showWireframe').name('Wireframe');
  gui.add(params, 'wind', 0, 2, 0.01).name('Wind');
  gui.add(params, 'stiffness', 0.1, 1, 0.01).name('Stiffness');
  gui.add(params, 'sphereRadius', 0.01, 1, 0.01).name('Sphere Radius');
  gui.add({ reset: () => window.location.reload() }, 'reset').name('Reset');

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, controls };
}
