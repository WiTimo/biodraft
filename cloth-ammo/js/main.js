import * as THREE from 'three';
import { ThreeManager } from './threeManager.js';
import { PhysicsManager } from './physicsManager.js';
import { ClothSimulation } from './clothSimulation.js';
import { loadHumanAndSetupCollision } from './human.js';
import { loadConfig } from './config.js';
import * as Compute from './compute2.js';

const USE_JSON_FILE = false;

async function init() {
    // Load configuration first
    if (USE_JSON_FILE) await loadConfig('./patterns_with_seams.json');
    
    // Initialize managers
    const threeManager = new ThreeManager();
    const physicsManager = new PhysicsManager();
    const clothSimulation = new ClothSimulation();
    
    // Setup Three.js scene using the init method
    threeManager.init();
    
    // Setup physics world
    physicsManager.setupPhysicsWorld();
    window.physicsManager = physicsManager;

    // Load human model and setup collision with Ammo.js optimization
    try {
        throw new Error("Human model loading is not implemented yet");
        const humanData = await loadHumanAndSetupCollision(
            threeManager.getScene(),
            physicsManager.getPhysicsWorld(),
            Compute,
            threeManager.getParams().colliderThickness
        );
        console.log('Human loaded successfully:', humanData);

        // Set human components in Three.js manager
        threeManager.setHumanComponents(humanData);

    } catch (error) {
        console.error('Failed to load human:', error);

        // Only set up dummy collider if human loading fails
        const dummyPositions = new Float32Array([4, 4, 4, 4, 4, 4, 4, 4, 4]);
        const dummyIndices = new Uint32Array([0, 1, 2]);
        Compute.setupColliderBuffers({
            positions: dummyPositions,
            indices: dummyIndices
        });

        // Visualization of dummy collider
        const dummyGeo = new THREE.BufferGeometry();
        dummyGeo.setAttribute('position', new THREE.BufferAttribute(dummyPositions, 3));
        dummyGeo.setIndex(new THREE.BufferAttribute(dummyIndices, 1));

        const dummyMat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: true,
            transparent: true,
            opacity: 0.5,
            depthTest: false
        });

        const dummyMesh = new THREE.Mesh(dummyGeo, dummyMat);
        threeManager.getScene().add(dummyMesh);
    }

    // Initialize cloth simulation
    const clothData = clothSimulation.initialize();

    // Setup compute buffers and uniforms
    Compute.setupBuffers(
        clothData.verletVertices,
        clothData.verletSprings,
        clothData.seamDebugPairs
    );
    Compute.setupUniforms(threeManager.getParams());
    Compute.setupComputeShaders(
        clothData.verletVertices,
        clothData.verletSprings
    );

    // Create cloth mesh
    threeManager.createClothMesh(
        clothData.verletVertices,
        clothData.globalIdx
    );

    // Setup GUI
    threeManager.setupGUI(
        clothData.verletSprings,
        clothData.seamDebugPairs
    );

    // Set initial visibility
    threeManager.updateClothVisibility(threeManager.getParams().showCloth);

    // Start render loop
    threeManager.getRenderer().setAnimationLoop(() =>
        threeManager.render(
            clothData.verletVertices,
            clothData.verletSprings,
            clothData.seamDebugPairs
        )
    );
}

// Load the json throug the webview
window.setClothPattern = async function (json) {
  try {
    await loadConfig("", json);
    await init().catch(console.error);
  } catch (err) {
    console.error('Invalid pattern JSON or error during init:', err);
  }
};

// for the 3D viewer to receive messages from the parent window
window.addEventListener('message', (event) => {
  if (event.data?.type === 'setClothPattern') {
    if (typeof window.setClothPattern === 'function') {
      window.setClothPattern(event.data.payload);
    } else {
      console.warn('setClothPattern not defined yet');
    }
  }
});

// Initialize the application
if(USE_JSON_FILE) init().catch(console.error); 