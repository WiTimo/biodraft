// js/app/setupCompute.js

import * as Compute    from '../compute/index.js';
import { params }      from './config.js';

export function setupCompute({ verletVertices, verletSprings, seamDebugPairs }) {
  Compute.setupBuffers(verletVertices, verletSprings, seamDebugPairs);
  Compute.setupUniforms(params);
  Compute.setupComputeShaders(verletVertices, verletSprings);
}
