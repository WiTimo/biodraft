// js/app/setupScene.js

import * as THREE        from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { sphereRadius }  from './config.js';

export function setupScene({ clothMesh, seamLines }) {
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    40, window.innerWidth/window.innerHeight, 0.01, 10
  );
  camera.position.set(-1.6, -0.1, -1.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 1;
  controls.maxDistance = 3;
  controls.target.set(0, -0.1, 0);
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dl = new THREE.DirectionalLight(0xffffff, 1);
  dl.position.set(1,1,1);
  scene.add(dl, clothMesh, seamLines);

  const sphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(sphereRadius * 0.95, 4),
    new THREE.MeshStandardNodeMaterial()
  );
  scene.add(sphere);

  return { renderer, scene, camera, controls, sphere };
}
