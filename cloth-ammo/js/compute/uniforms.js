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

  // gentler gravity so cloth settles on the mesh
  gravityBaseUniform   = uniform(0.000007);
  gravityAccelUniform  = uniform(0.00001);

  seamTightnessUniform = uniform(0.0);
  sphereRadiusUniform  = uniform(params.sphereRadius);
}
