// js/compute/uniforms.js

import * as THREE from 'three';
import { uniform } from 'three/tsl';

export let stiffnessUniform,
           windUniform,
           spherePositionUniform,
           sphereUniform,
           sphereRadiusUniform,
           dampingUniform,
           gravityBaseUniform,
           gravityAccelUniform,
           seamTightnessUniform;

export function setupUniforms(params) {
  stiffnessUniform      = uniform(params.stiffness);
  windUniform           = uniform(params.wind);
  spherePositionUniform = uniform(new THREE.Vector3());
  sphereUniform         = uniform(1.0);
  sphereRadiusUniform   = uniform(params.sphereRadius);
  dampingUniform        = uniform(0.98);
  gravityBaseUniform    = uniform(0.0);
  gravityAccelUniform   = uniform(0.00002);
  seamTightnessUniform  = uniform(0.0);
}
