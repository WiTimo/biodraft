import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { attribute } from 'three/tsl';
import * as Compute from './compute2.js';

export class ThreeManager {
    constructor() {
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.clock = new THREE.Clock();
        this.gui = null;

        // Cloth-related properties
        this.clothMesh = null;
        this.clothMaterial = null;

        // Human-related properties
        this.humanModel = null;
        this.humanColliderMesh = null;
        this.humanDebugMesh = null;
        this.originalHumanData = null; // Store original data for collider recreation

        // Animation properties
        this.timeSinceLastStep = 0;
        this.timestamp = 0;
        this.frameCount = 0;
        this.seamingCompleted = false;

        // Parameters
        this.params = {
            showWireframe: true,
            stiffness: 0.18,
            seamSpeed: 9,
            showHuman: true,
            showCloth: true,
            disableHuman: false,
            colliderThickness: 0.01, // Thickness of the collider layer in units
            showAllColliders: false // Show all collision visualizations
        };

        // Debug info
        this.debugInfo = {
            totalSprings: 0,
            seamSprings: 0,
            seamProgress: '0%',
            simulationTime: '0.0s'
        };
    }

    setupRenderer() {
        this.renderer = new THREE.WebGPURenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
    }

    setupCameraControls() {
        this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 10);
        this.camera.position.set(-1.6, -0.1, 1.6);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.minDistance = 1;
        this.controls.maxDistance = 3;
        this.controls.target.set(0, -0.1, 0);
        this.controls.update();
    }

    setupLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 2.0));
        const dl = new THREE.DirectionalLight(0xffffff, 1.5);
        dl.position.set(1, 1, 1);
        this.scene.add(dl);
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
    }

    createClothMesh(verletVertices, globalIdx) {
        console.log('createClothMesh called with:', {
            verletVerticesLength: verletVertices?.length,
            globalIdxLength: globalIdx?.length,
            Compute: Compute,
            vertexPositionBuffer: Compute?.vertexPositionBuffer
        });

        const nVerts = verletVertices.length;
        const vid = new Uint32Array(nVerts);
        for (let i = 0; i < nVerts; i++) vid[i] = i;

        const geom = new THREE.BufferGeometry();
        geom.setIndex(new THREE.BufferAttribute(new Uint32Array(globalIdx), 1));
        geom.setAttribute('vertexId', new THREE.BufferAttribute(vid, 1));
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3));
        geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3));

        this.clothMaterial = new THREE.MeshPhysicalNodeMaterial({
            color: 0x204080,
            side: THREE.DoubleSide,
            roughness: 0.3,
            metalness: 0.1
        });

        console.log('About to access vertexPositionBuffer:', Compute.vertexPositionBuffer);
        this.clothMaterial.positionNode = Compute.vertexPositionBuffer.element(attribute('vertexId'));

        this.clothMesh = new THREE.Mesh(geom, this.clothMaterial);
        this.clothMesh.frustumCulled = false;
        this.scene.add(this.clothMesh);
    }

    setupGUI(verletSprings, seamDebugPairs) {
        this.gui = new GUI();

        // Main controls
        const mainFolder = this.gui.addFolder('Simulation Controls');
        mainFolder.add(this.params, 'showWireframe').name('Show Wireframe');
        mainFolder.add(this.params, 'stiffness', 0.05, 0.3, 0.01).name('Cloth Stiffness');
        mainFolder.add(this.params, 'seamSpeed', 0.05, 0.5, 0.01).name('Seam Speed');
        mainFolder.add(this.params, 'showHuman').name('Show Human').onChange((value) => {
            this.updateHumanVisibility(value);
        });
        mainFolder.add(this.params, 'disableHuman').name('Disable Human').onChange(async (value) => {
            await this.updateHumanDisable(value);
        });
        mainFolder.add(this.params, 'showCloth').name('Show Cloth').onChange((value) => {
            this.updateClothVisibility(value);
        });
        mainFolder.add(this.params, 'colliderThickness', 0.01, 0.1, 0.01).name('Collider Thickness').onChange((value) => {
            this.updateColliderThickness(value);
        });
        mainFolder.add(this.params, 'showAllColliders').name('Show All Colliders').onChange((value) => {
            this.updateColliderVisibility(value);
        });
        mainFolder.open();

        // Debug info
        const debugFolder = this.gui.addFolder('Debug Info');
        this.debugInfo.totalSprings = verletSprings ? verletSprings.length : 0;
        this.debugInfo.seamSprings = seamDebugPairs ? seamDebugPairs.length : 0;

        debugFolder.add(this.debugInfo, 'totalSprings').name('Total Springs').listen();
        debugFolder.add(this.debugInfo, 'seamSprings').name('Seam Springs').listen();
        debugFolder.add(this.debugInfo, 'seamProgress').name('Seam Progress').listen();
        debugFolder.add(this.debugInfo, 'simulationTime').name('Simulation Time').listen();

        // Reset button
        debugFolder.add({
            reset: () => {
                location.reload();
            }
        }, 'reset').name('Reset Simulation');

        debugFolder.open();
    }

    updateHumanVisibility(visible) {
        if (this.humanModel) {
            this.humanModel.visible = visible;
        }
        if (this.humanColliderMesh) {
            this.humanColliderMesh.visible = visible && this.params.showAllColliders;
        }
        if (this.humanDebugMesh) {
            this.humanDebugMesh.visible = visible && this.params.showAllColliders;
        }
    }

    updateClothVisibility(visible) {
        if (this.clothMesh) {
            this.clothMesh.visible = visible;
        }
    }

    async updateColliderThickness(newThickness) {
        if (!this.originalHumanData || this.params.disableHuman) {
            return;
        }

        try {
            // Import the human module to access the setup function
            const humanModule = await import('./human.js');

            // Remove old collision components
            if (this.humanColliderMesh) {
                this.scene.remove(this.humanColliderMesh);
            }
            if (this.humanDebugMesh) {
                this.scene.remove(this.humanDebugMesh);
            }

            // Import Compute module
            const Compute = await import('./compute2.js');

            // Recreate collision with new scale
            const { collisionBody, optimizedGeometry, colliderMesh } = humanModule.setupHumanCollision(
                this.originalHumanData.mergedGeometry || this.originalHumanData.optimizedGeometry,
                this.originalHumanData.positions,
                this.originalHumanData.indices,
                this.scene,
                window.physicsManager.getPhysicsWorld(),
                Compute,
                newThickness
            );

            // Create new debug visualizations
            const { colliderMesh: debugColliderMesh, debugMesh } = humanModule.createDebugVisualization(
                this.originalHumanData.optimizedGeometry || this.originalHumanData.mergedGeometry,
                this.originalHumanData.positions,
                this.originalHumanData.indices,
                newThickness
            );

            // Update references
            this.humanColliderMesh = debugColliderMesh;
            this.humanDebugMesh = debugMesh;

            // Add to scene
            this.scene.add(debugColliderMesh);
            this.scene.add(debugMesh);

        } catch (error) {
            console.error('Error updating collider thickness:', error);
        }
    }

    updateColliderVisibility(visible) {
        // Update collider mesh visibility (green wireframe)
        if (this.humanColliderMesh) {
            this.humanColliderMesh.visible = visible;
        }

        // Update debug mesh visibility (original geometry wireframe)
        if (this.humanDebugMesh) {
            this.humanDebugMesh.visible = visible;
        }

        console.log(`Collider visibility updated to: ${visible}`);
    }

    async updateHumanDisable(disabled) {
        if (disabled) {
            if (this.humanModel) {
                this.humanModel.visible = false;
                this.scene.remove(this.humanModel);
            }
            if (this.humanColliderMesh) {
                this.humanColliderMesh.visible = false;
                this.scene.remove(this.humanColliderMesh);
            }
            if (this.humanDebugMesh) {
                this.humanDebugMesh.visible = false;
                this.scene.remove(this.humanDebugMesh);
            }

            const dummyPositions = new Float32Array([4, 4, 4, 4, 4, 4, 4, 4, 4]);
            const dummyIndices = new Uint32Array([0, 1, 2]);
            Compute.setupColliderBuffers({
                positions: dummyPositions,
                indices: dummyIndices
            });
        } else {
            if (this.humanModel) {
                this.scene.add(this.humanModel);
                this.humanModel.visible = this.params.showHuman;
            }
            if (this.humanColliderMesh) {
                this.scene.add(this.humanColliderMesh);
                this.humanColliderMesh.visible = this.params.showHuman && this.params.showAllColliders;
            }
            if (this.humanDebugMesh) {
                this.scene.add(this.humanDebugMesh);
                this.humanDebugMesh.visible = this.params.showHuman && this.params.showAllColliders;
            }

            // Re-setup human collision if available
            if (window.humanCollisionData) {
                Compute.setupColliderBuffers({
                    ...window.humanCollisionData
                });
            }
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    setHumanComponents(humanData) {
        this.humanModel = humanData.gltfScene;
        this.humanColliderMesh = humanData.colliderMesh;
        this.humanDebugMesh = humanData.debugMesh;
        this.originalHumanData = humanData; // Store original data

        // Store collision data globally for re-enabling
        window.humanCollisionData = {
            positions: humanData.positions,
            indices: humanData.indices
        };

        // Set initial visibility based on params
        this.updateHumanVisibility(this.params.showHuman);

        // Apply disable state if needed
        if (this.params.disableHuman) {
            this.updateHumanDisable(true);
        }
    }

    updateClothPositions(verletVertices) {
        const attr = this.clothMesh.geometry.attributes.position;
        const arr = attr.array;
        verletVertices.forEach((v, i) => {
            arr[i * 3] = v.position.x;
            arr[i * 3 + 1] = v.position.y;
            arr[i * 3 + 2] = v.position.z;
        });
        attr.needsUpdate = true;
    }

    updateDebugInfo(verletSprings, seamDebugPairs) {
        this.frameCount++;
        if (this.frameCount % 60 === 0) {
            const seamProgress = Math.min(this.timestamp * this.params.seamSpeed, 1.0);

            // Update GUI debug info
            this.debugInfo.seamProgress = `${(seamProgress * 100).toFixed(1)}%`;
            this.debugInfo.simulationTime = `${this.timestamp.toFixed(1)}s`;

            // Simple debug output
            console.log(`Simulation: ${this.timestamp.toFixed(1)}s | Springs: ${verletSprings.length} | Seam Springs: ${seamDebugPairs.length} | Seam Progress: ${(seamProgress * 100).toFixed(1)}%`);
        }
    }

    async render(verletVertices, verletSprings, seamDebugPairs) {
        const dt = Math.min(this.clock.getDelta(), 1 / 60);
        this.timeSinceLastStep += dt;
        const tStep = 1 / 240;

        while (this.timeSinceLastStep >= tStep) {
            this.timeSinceLastStep -= tStep;
            this.timestamp += tStep;

            Compute.stiffnessUniform.value = this.params.stiffness;
            Compute.seamTightnessUniform.value = Math.min(this.timestamp * this.params.seamSpeed, 1.0);
            // Remove collisionStrengthUniform as it doesn't exist in the simple version

            // Check if seaming just completed
            if (Compute.seamTightnessUniform.value >= 1.0 && !this.seamingCompleted) {
                this.seamingCompleted = true;
                console.log('🎉 Seaming completed!');

                // Activate gravity for the cloth
                Compute.gravityUniform.value = 0.0000981; //0.00981;
                console.log('🌍 Gravity activated for cloth!');
            }

            // Remove collision-related compute calls as they don't exist in the simple version
            await this.renderer.computeAsync(Compute.computeSpringForces);
            await this.renderer.computeAsync(Compute.computeCollision);
            await this.renderer.computeAsync(Compute.computeVertexForces);
        }

        // Update cloth mesh positions
        this.updateClothPositions(verletVertices);

        // Update debug info
        this.updateDebugInfo(verletSprings, seamDebugPairs);

        this.clothMesh.material.wireframe = this.params.showWireframe;
        await this.renderer.renderAsync(this.scene, this.camera);
    }

    init() {
        this.scene = new THREE.Scene();
        this.setupRenderer();
        this.setupCameraControls();
        this.setupLights();
        this.setupEventListeners();
    }

    getParams() {
        return this.params;
    }

    getScene() {
        return this.scene;
    }

    getRenderer() {
        return this.renderer;
    }

    getCamera() {
        return this.camera;
    }

    getControls() {
        return this.controls;
    }

    getClock() {
        return this.clock;
    }
} 