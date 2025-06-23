// js/app/setupGUI.js

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { params } from './config.js';

export function setupGUI() {
  const gui = new GUI();
  gui.add(params, 'showWireframe').name('Wireframe');
  gui.add(params, 'showSphere').   name('Show Sphere');
  gui.add(params, 'wind', 0, 2, 0.01).name('Wind');
  gui.add(params, 'stiffness', 0.1, 1, 0.01).name('Stiffness');
  gui.add({ reset: () => window.location.reload() }, 'reset')
     .name('Reset');
}
