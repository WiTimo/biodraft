// js/compute/uniforms.js

import { uniform } from 'three/tsl';

export let stiffnessUniform,
           windUniform,
           dampingUniform,
           gravityBaseUniform,
           gravityAccelUniform,
           seamTightnessUniform,
           sphereRadiusUniform;

export function setupUniforms(params) {
  stiffnessUniform     = uniform(params.stiffness);
  windUniform          = uniform(params.wind);
  dampingUniform       = uniform(0.98);
  gravityBaseUniform   = uniform(0.0);
  gravityAccelUniform  = uniform(0.00002);
  seamTightnessUniform = uniform(0.0);
  sphereRadiusUniform  = uniform(params.sphereRadius);
}
