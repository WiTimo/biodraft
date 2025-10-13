import * as THREE from 'three';
import { ThreeManager } from './threeManager.js';
import { PhysicsManager } from './physicsManager.js';
import { ClothSimulation } from './clothSimulation.js';
import { loadHumanAndSetupCollision, createBoneProbe } from './human.js';
import { loadConfig } from './config.js';
import * as Compute from './compute.js';
import { SETTINGS } from '../settings.js';
import { initLogging } from './logger.js';

function calibrateClothVerticalToHead(threeManager, clothData) {
    if (!threeManager.humanModel) return;
    const humanBox = new THREE.Box3().setFromObject(threeManager.humanModel);
    const headTopY = humanBox.max.y;
    const humanHeightUnits = humanBox.max.y - humanBox.min.y;
    if (!(humanHeightUnits > 0)) return;

    let clothTopY = -Infinity;
    for (const v of clothData.verletVertices) if (v.position.y > clothTopY) clothTopY = v.position.y;
    if (!Number.isFinite(clothTopY)) return;

    const ratio = SETTINGS.CLOTH_TOP_FROM_HEAD_RATIO;
    const targetClothTopY = headTopY - ratio * humanHeightUnits;
    const dY = targetClothTopY - clothTopY;
    if (Math.abs(dY) > 1e-6) {
        for (const v of clothData.verletVertices) v.position.y += dY;
        clothData.initialVertexPositions = clothData.verletVertices.map(v => v.position.clone());
    }
}

async function init() {
    initLogging();
    await loadConfig(SETTINGS.JSON_PATH);
    
    // Initialize managers
    const threeManager = new ThreeManager();
    const physicsManager = new PhysicsManager();
    let clothSimulation = new ClothSimulation(threeManager.getParams());
    let clothData = null;
    
    // Setup Three.js scene using the init method
    threeManager.init();
    
    // Setup physics world
    physicsManager.setupPhysicsWorld();
    window.physicsManager = physicsManager;

    // Load human model and setup collision with Ammo.js optimization
    try {
        const humanData = await loadHumanAndSetupCollision(
            threeManager.getScene(),
            physicsManager.getPhysicsWorld(),
            Compute,
            threeManager.getParams().colliderThickness
        );

        // Set human components in Three.js manager
        threeManager.setHumanComponents(humanData);

        // Setup animation and dynamic collision update callback
        if (humanData.mixer || humanData.dynamicCollider) {
            document.title = 'Cloth Sim - Animation System Ready';
            
            const boneProbe = createBoneProbe(humanData.firstSkinnedMesh);
            threeManager.addUpdateCallback((deltaTime) => {
                // Start human animation only after seaming is completed
                if (!threeManager.seamingCompleted) {
                    return;
                }

                // One-time start/ensure actions are playing after seam completion
                if (SETTINGS?.PARAMS?.animationsEnabled) {
                    if (!threeManager._animationStartedAfterSeam) {
                        if (typeof threeManager.startHumanAnimations === 'function') {
                            threeManager.startHumanAnimations();
                        }
                        threeManager._animationStartedAfterSeam = true;
                    }
                }

                // Use the current mixer on threeManager to avoid stale references
                if (SETTINGS?.PARAMS?.animationsEnabled && threeManager.mixer) {
                    threeManager.mixer.update(deltaTime);
                    // Debug animation progress
                    if (!window.__animDbg) window.__animDbg = { lastLogTime: 0 };
                    const ad = window.__animDbg;
                    ad.lastLogTime += deltaTime;
                }
                if (boneProbe) boneProbe.update(deltaTime);

                // Update collider positions from current animated pose (post-seaming)
                if (humanData.dynamicCollider) {
                    humanData.dynamicCollider.update();
                    Compute.setupColliderBuffers({
                        positions: humanData.dynamicCollider.positions,
                        indices: humanData.dynamicCollider.indices
                    });

                    // Update dynamic debug mesh attribute if present
                    if (threeManager.humanColliderMesh && threeManager.humanColliderMesh.geometry) {
                        const pos = threeManager.humanColliderMesh.geometry.getAttribute('position');
                        if (pos && pos.array === humanData.dynamicCollider.positions) {
                            pos.needsUpdate = true;
                        }
                    }
                }
            });
        }

    } catch (error) {

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
    clothData = clothSimulation.initialize();
    // Adjust cloth vertical position relative to head, persisted
    calibrateClothVerticalToHead(threeManager, clothData);

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
    // Initialize dynamic uniforms that depend on params
    if (Compute.clothWeightUniform) Compute.clothWeightUniform.value = threeManager.getParams().clothWeight ?? 1.0;

    threeManager.setCurrentTopology(clothData.verletVertices, clothData.verletSprings);

    // Create cloth mesh with UVs
    threeManager.createClothMesh(
        clothData.verletVertices,
        clothData.globalIdx,
        clothData.uvs
    );

    // Setup GUI
    threeManager.setupGUI();

    window.threeManager = threeManager;
    window.dispatchEvent(new CustomEvent('three-manager-ready', { detail: threeManager }));

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

    // Provide a global rebuild hook used by GUI controls
    window.requestClothRebuild = () => {
        // Preserve current params (already mutated by GUI) and recreate cloth
        // Remove existing mesh
        if (threeManager.clothMesh) {
            threeManager.getScene().remove(threeManager.clothMesh);
            threeManager.clothMesh.geometry?.dispose();
            threeManager.clothMesh.material?.dispose();
        }
        // Reset seaming state
        threeManager.seamingCompleted = false;
        threeManager.seamCompleteTime = undefined;

        clothSimulation = new ClothSimulation(threeManager.getParams());
        clothData = clothSimulation.initialize();
        calibrateClothVerticalToHead(threeManager, clothData);

        // Recreate compute buffers
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
        if (Compute.clothWeightUniform) Compute.clothWeightUniform.value = threeManager.getParams().clothWeight ?? 1.0;
        threeManager.setCurrentTopology(clothData.verletVertices, clothData.verletSprings);
        threeManager.createClothMesh(
            clothData.verletVertices,
            clothData.globalIdx,
            clothData.uvs
        );
    };

    // Expose reload hook for settings UI
    window.reloadHumanFromStore = async () => {
        const scene = threeManager.getScene();
        if (threeManager.humanModel) scene.remove(threeManager.humanModel);
        if (threeManager.humanColliderMesh) scene.remove(threeManager.humanColliderMesh);
        if (threeManager.humanDebugMesh) scene.remove(threeManager.humanDebugMesh);
        try {
            const humanData = await loadHumanAndSetupCollision(
                threeManager.getScene(),
                physicsManager.getPhysicsWorld(),
                Compute,
                threeManager.getParams().colliderThickness
            );
            threeManager.setHumanComponents(humanData);
        } catch (e) {  }
        // Re-apply cloth calibration after new model
        calibrateClothVerticalToHead(threeManager, clothData);
    };
}

// Initialize the application
init().catch(console.error); 