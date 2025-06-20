// js/init/modelLoader.js

import * as THREE from 'three';
import * as Compute from '../compute/index.js';

export function loadModelCollision(scene) {
  // 1) Visualize a test sphere in the scene:
  const geo  = new THREE.SphereGeometry(0.3, 32, 32);
  const mat  = new THREE.MeshNormalMaterial({ wireframe: true });
  const sph  = new THREE.Mesh(geo, mat);
  sph.position.set( 0, 0.3, 0 );
  scene.add(sph);

  // 2) Tell the cloth‐sim to collide against that single center‐point:
  const spherePositions = new Float32Array([
    0.0, 0.3, 0.0    // one sphere at world‐space (0,0.3,0)
  ]);
  Compute.setupCollisionBuffers(spherePositions);

  // 3) Return it so loop.js still “thinks” there was a mesh
  return spherePositions;
}
