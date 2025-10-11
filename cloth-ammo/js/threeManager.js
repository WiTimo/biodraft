import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { attribute, vec3, texture, uv as uvNode, instancedArray } from 'three/tsl';
import * as Compute from './compute.js';
const { mergeSeamsTopologically } = await import('./utils.js');
import { patternData } from './config.js';
import { SETTINGS } from '../settings.js';
import { createHeatmapColorNode, getStressCalculation } from './heatmapUtils.js';

/**
 * Orchestrates Three.js scene setup and per-frame rendering.
 * - Owns scene, renderer, camera/controls, lights, and the cloth/human meshes
 * - Bridges compute buffers to the cloth geometry via NodeMaterial positionNode
 */
export class ThreeManager {
    constructor() {
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.clock = new THREE.Clock();
        this.ui = {};
        this.updateCallbacks = [];

        // Cloth-related properties
        this.clothMesh = null;
        this.clothMaterial = null;
        this.uvs = null;
        this.texture = null;

        // Human-related properties
        this.humanModel = null;
        this.humanColliderMesh = null;
        this.humanDebugMesh = null;
        this.originalHumanData = null;

        // Animation properties
        this.timeSinceLastStep = 0;
        this.timestamp = 0;
        this.frameCount = 0;
        this.seamingCompleted = false;
        this.mixer = null;
        this.animationActions = [];
        this.hasAnimations = false;
        this._getColliderFromScene = null;
        this.dynamicCollisionEnabled = true;     this.originalClothIndices = null;
    this.mergedTopology = false;
    this.topologyChanged = false;
    this.weightDropped = false;

        // Parameters from settings
        this.params = { ...(SETTINGS?.PARAMS || {}) };

        // Debug info
        this.debugInfo = {
            totalSprings: 0,
            seamSprings: 0,
            seamProgress: '0%',
            simulationTime: '0.0s'
        };
    }

    /** Create and attach the renderer to the document body. */
    setupRenderer() {
        this.renderer = new THREE.WebGPURenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // Light clear to blend with page background
        this.renderer.setClearColor(0xf6f7fb, 1);
        // Keep output linear without filmic tonemapping affecting UI textures
        this.renderer.toneMapping = THREE.NoToneMapping;
        document.body.appendChild(this.renderer.domElement);
    }

    /** Create a perspective camera with orbit controls tuned for human scale. */
    setupCameraControls() {
        this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 10);
        this.camera.position.set(-1.6, -0.1, 1.6);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.minDistance = 1;
        this.controls.maxDistance = 3;
        this.controls.target.set(0, -0.1, 0);
        this.controls.update();
    }

    /** Add a balanced light setup (hemi + key/fill/rim). */
    setupLights() {
        // Subtle ambient base
        const hemi = new THREE.HemisphereLight(0xffffff, 0xe9eef7, 0.9);
        this.scene.add(hemi);

        // Key light
        const key = new THREE.DirectionalLight(0xffffff, 1.0);
        key.position.set(2.5, 3.5, 2.2);
        this.scene.add(key);

        // Fill light
        const fill = new THREE.DirectionalLight(0xffffff, 0.55);
        fill.position.set(-3.0, 1.0, 1.8);
        this.scene.add(fill);

        // Rim light for silhouette
        const rim = new THREE.DirectionalLight(0xffffff, 0.45);
        rim.position.set(0.5, 2.2, -3.0);
        this.scene.add(rim);
    }

    /** Window resize handler to keep aspect and size in sync. */
    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
    }

    /**
     * Build cloth mesh and unlit material bound to compute buffer positions.
     * - verletVertices: array of VerletVertex with .position Vector3
     * - globalIdx: triangle indices
     * - uvs: per-vertex UV tuples (u,v) to sample the pattern texture
     */
    createClothMesh(verletVertices, globalIdx, uvs = []) {
        this.originalClothIndices = new Uint32Array(globalIdx);

        const clothVertexCount = verletVertices.length;
        const verticesIds = new Uint32Array(clothVertexCount);
        for (let i = 0; i < clothVertexCount; i++) verticesIds[i] = i;

        const clothMeshGeometry = new THREE.BufferGeometry();
        clothMeshGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(globalIdx), 1));
        clothMeshGeometry.setAttribute('vertexId', new THREE.BufferAttribute(verticesIds, 1));
        clothMeshGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(clothVertexCount * 3), 3));
        clothMeshGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(clothVertexCount * 3), 3));
        if (uvs && uvs.length === clothVertexCount) {
            const uvArr = new Float32Array(clothVertexCount * 2);
            for (let i = 0; i < clothVertexCount; i++) { uvArr[2*i] = uvs[i][0]; uvArr[2*i+1] = uvs[i][1]; }
            clothMeshGeometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
            this.uvs = uvs;
        } else {
            clothMeshGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(clothVertexCount * 2).fill(0), 2));
            this.uvs = Array.from({ length: clothVertexCount }, () => [0,0]);
        }

        // Unlit cloth so pattern brightness is not affected by scene lighting
        this.clothMaterial = new THREE.MeshBasicNodeMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });
        // Avoid tone mapping darkening the texture
        this.clothMaterial.toneMapped = false;

        this.clothMaterial.positionNode = Compute.vertexPositionBuffer.element(attribute('vertexId'));

        try {
            if (this.texture) {
                const tNode = texture(this.texture);
                this.clothMaterial.colorNode = tNode.sample(uvNode());
            } else {
                const texDef = patternData?.patterns?.[0]?.texture;
                if (texDef?.src) {
                    const loader = new THREE.TextureLoader();
                    const tex = loader.load(texDef.src, () => {
                        // Ensure correct color space for UI-authored textures
                        tex.colorSpace = THREE.SRGBColorSpace;
                        const rep = (texDef.repeat || 'repeat').toLowerCase();
                        if (rep === 'repeat') tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                        else if (rep === 'mirror') tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
                        else tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
                        tex.repeat.set(Number.isFinite(texDef.scaleX)?texDef.scaleX:1, Number.isFinite(texDef.scaleY)?texDef.scaleY:1);
                        tex.offset.set(Number.isFinite(texDef.offsetX)?texDef.offsetX:0, Number.isFinite(texDef.offsetY)?texDef.offsetY:0);
                        tex.center.set(0.5, 0.5);
                        tex.rotation = Number.isFinite(texDef.rotation)?texDef.rotation:0;
                        tex.needsUpdate = true;
                        this.texture = tex;
                        const tNode2 = texture(tex);
                        this.clothMaterial.colorNode = tNode2.sample(uvNode());
                    });
                } else {
                    // Default to white if no texture defined
                    this.clothMaterial.colorNode = vec3(1.0, 1.0, 1.0);
                }
            }
        } catch (e) {
            this.clothMaterial.colorNode = vec3(1.0, 1.0, 1.0);
        }

        this.clothMesh = new THREE.Mesh(clothMeshGeometry, this.clothMaterial);
        this.clothMesh.frustumCulled = false;
        this.scene.add(this.clothMesh);
        
        // Initialize color node based on current heatmap settings
        this.updateClothMaterialColorNode();
    }

    /** Update cloth material color node based on heatmap settings */
    updateClothMaterialColorNode() {
        if (!this.clothMaterial) return;

        if (this.params.heatmapEnabled) {
            // Use configurable stress calculation (fragment or vertex-based)
            const stressValue = getStressCalculation();
            const scaledStress = stressValue.mul(Compute.heatmapSensitivityUniform || float(2.0));
            this.clothMaterial.colorNode = createHeatmapColorNode(scaledStress);
        } else {
            // Use texture or default color
            try {
                if (this.texture) {
                    const tNode = texture(this.texture);
                    this.clothMaterial.colorNode = tNode.sample(uvNode());
                } else {
                    const texDef = patternData?.patterns?.[0]?.texture;
                    if (texDef?.src && this.texture) {
                        const tNode = texture(this.texture);
                        this.clothMaterial.colorNode = tNode.sample(uvNode());
                    } else {
                        this.clothMaterial.colorNode = vec3(1.0, 1.0, 1.0);
                    }
                }
            } catch (e) {
                this.clothMaterial.colorNode = vec3(1.0, 1.0, 1.0);
            }
        }

        this.clothMaterial.needsUpdate = true;
    }

    /** Create optional GUI toggles, guarded by SETTINGS.SHOW_THREE_GUI. */
    setupGUI() {
        if (!SETTINGS.SHOW_THREE_GUI) {
            const container = document.querySelector('.viewer-controls');
            if (container) container.style.display = 'none';
            return;
        }

        const container = document.querySelector('.viewer-controls');
        if (!container) return;

        container.style.removeProperty('display');

        const wireframeBtn = container.querySelector('[data-control="wireframe"]');
        const stressBtn = container.querySelector('[data-control="stress"]');

        this.ui = {
            controlsContainer: container,
            wireframeToggle: wireframeBtn || null,
            heatmapToggle: stressBtn || null
        };

        this.setToggleState(wireframeBtn, !!this.params.showWireframe);
        this.setToggleState(stressBtn, !!this.params.heatmapEnabled);

        wireframeBtn?.addEventListener('click', () => {
            const next = !this.params.showWireframe;
            this.params.showWireframe = next;
            if (this.clothMesh?.material) {
                this.clothMesh.material.wireframe = next;
            }
            this.setToggleState(wireframeBtn, next);
        });

        stressBtn?.addEventListener('click', () => {
            const next = !this.params.heatmapEnabled;
            this.updateHeatmapVisualization(next);
        });
    }

    /** Update toggle styling to reflect active state */
    setToggleState(button, active) {
        if (!button) return;
        if (active) button.classList.add('is-active');
        else button.classList.remove('is-active');
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    /** Toggle visibility of human meshes and their debug colliders. */
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

    /** Toggle visibility of the cloth mesh. */
    updateClothVisibility(visible) {
        if (this.clothMesh) {
            this.clothMesh.visible = visible;
        }
    }

    /** Rebuild the Ammo collider with a different thickness. */
    async updateColliderThickness(newThickness) {
        if (!this.originalHumanData || this.params.disableHuman) {
            return;
        }

        try {
            const humanModule = await import('./human.js');

            // Remove old collision components
            if (this.humanColliderMesh) {
                this.scene.remove(this.humanColliderMesh);
            }
            if (this.humanDebugMesh) {
                this.scene.remove(this.humanDebugMesh);
            }

            // Import Compute module
            const Compute = await import('./compute.js');

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

        } catch (error) {  }
    }

    /** Show/hide the debug collider meshes. */
    updateColliderVisibility(visible) {
        // Update collider mesh visibility (green wireframe)
        if (this.humanColliderMesh) {
            this.humanColliderMesh.visible = visible;
        }

        // Update debug mesh visibility (original geometry wireframe)
        if (this.humanDebugMesh) {
            this.humanDebugMesh.visible = visible;
        }
    }

    /** Update heatmap visualization on/off */
    updateHeatmapVisualization(enabled) {
        this.params.heatmapEnabled = enabled;

        if (Compute.heatmapEnabledUniform) {
            Compute.heatmapEnabledUniform.value = enabled;
        }

        this.setToggleState(this.ui?.heatmapToggle, enabled);

        if (this.clothMaterial) {
            this.updateClothMaterialColorNode();
        }
    }

    /** Update heatmap sensitivity */
    updateHeatmapSensitivity(sensitivity) {
        this.params.heatmapSensitivity = sensitivity;
        // No need to update material, this is handled by uniform updates in render loop
    }

    /** Update stress calculation mode (REMOVED - now always uses vertex-based calculation) */
    updateStressCalculationMode(mode) {
        // No-op: stress calculation is now always vertex-based
        // Kept for backwards compatibility with UI
    }

    /** Enable/disable human and reconfigure compute collider buffers accordingly. */
    async updateHumanDisabled(disabled) {
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

            Compute.setupColliderBuffers({ positions: new Float32Array(0), indices: new Uint32Array(0) });
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

    /** Keep camera aspect and renderer size in sync with the window. */
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /** Inject loaded human assets and wire up visibility and animation state. */
    setHumanComponents(humanData) {
        this.humanModel = humanData.gltfScene;
        this.humanColliderMesh = humanData.colliderMesh;
        this.humanDebugMesh = humanData.debugMesh;
        this.originalHumanData = humanData;
        this.hasAnimations = Array.isArray(humanData.animations) && humanData.animations.length > 0;
        this.mixer = humanData.mixer;
        this.dynamicCollider = humanData.dynamicCollider;
        this.firstSkinnedMesh = humanData.firstSkinnedMesh;

        window.humanCollisionData = {
            positions: humanData.positions,
            indices: humanData.indices
        };

        this.updateHumanVisibility(this.params.showHuman);

        if (this.params.disableHuman) {
            this.updateHumanDisabled(true);
        }
    }

    /** Start any available animation clips on the human model. */
    startHumanAnimations() {
        if (!this.humanModel) {
            return;
        }
        if (!this.hasAnimations) {
            return;
        }
        if (!SETTINGS?.PARAMS?.animationsEnabled) {
            return;
        }
        this.mixer = new THREE.AnimationMixer(this.humanModel);
        this.animationActions = [];
        const clips = this.originalHumanData.animations || [];
        clips.forEach((clip) => {
            const action = this.mixer.clipAction(clip);
            action.reset();
            action.play();
            this.animationActions.push(action);
        });
    }

    /** Copy computed positions into the cloth geometry attribute each frame. */
    updateClothPositions(verletVertices) {
        if (this.mergedTopology) return;
        if (!this.clothMesh) return;
        const attr = this.clothMesh.geometry.attributes.position;
        const arr = attr.array;
        verletVertices.forEach((v, i) => {
            arr[i * 3] = v.position.x;
            arr[i * 3 + 1] = v.position.y;
            arr[i * 3 + 2] = v.position.z;
        });
        attr.needsUpdate = true;
    }

    /** Main render loop step: runs compute steps and draws the frame. */
    async render(verletVertices, verletSprings, seamDebugPairs) {
        const dt = Math.min(this.clock.getDelta(), 1 / 60);
        this.timeSinceLastStep += dt;
        const tStep = 1 / 240;

        // Run update callbacks (animation, collision updates) before physics
        this.updateCallbacks.forEach(cb => cb(dt));

        // Recompile compute shaders each frame
        try {
            const verts = this.currentVerletVertices || verletVertices;
            const springs = this.currentVerletSprings || verletSprings;
            Compute.setupComputeShaders(verts, springs);
        } catch (e) {}

        while (this.timeSinceLastStep >= tStep) {
            this.timeSinceLastStep -= tStep;
            this.timestamp += tStep;

            Compute.stiffnessUniform.value = this.params.stiffness;
            Compute.seamTightnessUniform.value = Math.min(this.timestamp * this.params.seamSpeed, 1.0);
            // Keep base cloth weight until seaming completes
            if (!this.seamingCompleted && Compute.clothWeightUniform) {
                Compute.clothWeightUniform.value = this.params.clothWeight ?? 1.0;
            }
            // Gravity is disabled during seaming. After completion, ramp up smoothly.
            if (Compute.seamTightnessUniform.value < 1.0) {
                Compute.gravityUniform.value = 0.0;
            } else {
                const rampSeconds = Math.max(0.01, (this.params.gravityRampSeconds ?? 0.75));
                const t0 = this.seamCompleteTime ?? this.timestamp; // set on completion below as well
                const rampT = Math.max(0, this.timestamp - t0);
                const ramp = Math.min(1, rampT / rampSeconds);
                Compute.gravityUniform.value = this.params.gravityAccel * ramp;
            }

            if (Compute.seamTightnessUniform.value >= 1.0 && !this.seamingCompleted) {
                this.seamingCompleted = true;
                this.seamCompleteTime = this.timestamp;
                this.weightDropped = false;
                // Immediately increase weight so cloth settles after stitching
                if (Compute.clothWeightUniform) {
                    Compute.clothWeightUniform.value = this.params.clothWeightHigh ?? 3.0;
                }

                if (Compute.computeProjectSeams) {
                    await this.renderer.computeAsync(Compute.computeProjectSeams);
                }

                const oldPosBuf = Compute.vertexPositionBuffer;
                const oldForceBuf = Compute.vertexForceBuffer;

                const { newVertices, newSprings, newIdx, groupStarts, groupCounts, members, originalRestLengths } = mergeSeamsTopologically(
                    verletVertices, verletSprings, this.originalClothIndices, seamDebugPairs
                );

                Compute.setupBuffers(newVertices, newSprings, []);
                Compute.setupComputeShaders(newVertices, newSprings);
                this.topologyChanged = true;

                const remap = Compute.makeRemapAfterMerge({
                    oldPositionBuffer: oldPosBuf,
                    oldForceBuffer: oldForceBuf,
                    groupStartsArray: groupStarts,
                    groupCountsArray: groupCounts,
                    membersArray: members,
                    newVertexCount: newVertices.length
                });
                await this.renderer.computeAsync(remap);

                // Create buffer for original rest lengths and use it to preserve original spring lengths
                const originalRestLengthsBuffer = instancedArray(originalRestLengths, 'float');
                const resetRL = Compute.makeRecomputeRestLengths(newSprings.length, originalRestLengthsBuffer);
                await this.renderer.computeAsync(resetRL);

                if (this.clothMesh) {
                    this.clothMesh.geometry?.dispose();
                    this.clothMesh.material?.dispose();
                    this.scene.remove(this.clothMesh);
                }
                // Rebuild with merged UVs if available
                let mergedUVs = null;
                if (Array.isArray(this.uvs) && this.uvs.length > 0 && groupStarts && groupCounts && members) {
                    const newCount = newVertices.length;
                    mergedUVs = new Array(newCount);
                    for (let j = 0; j < newCount; j++) {
                        const start = groupStarts[j];
                        const count = groupCounts[j];
                        let u = 0, v = 0;
                        for (let k = 0; k < count; k++) {
                            const oldIndex = members[start + k];
                            const uv = this.uvs?.[oldIndex] || [0, 0];
                            u += uv[0];
                            v += uv[1];
                        }
                        const inv = count > 0 ? 1 / count : 1;
                        mergedUVs[j] = [u * inv, v * inv];
                    }
                }
                this.createClothMesh(newVertices, newIdx, mergedUVs ?? undefined);

                this.mergedTopology = true;

                const zero = Compute.makeZeroForces(newVertices.length);
                await this.renderer.computeAsync(zero);

                // gravity is ramped per substep post-seam

                this.debugInfo.totalSprings = newSprings.length;
                this.debugInfo.seamSprings = 0;

                // Update current topology so per-frame recompiles use new counts
                this.setCurrentTopology(newVertices, newSprings);

                // Animations now handled via update callbacks in main.js

                // Also show seaming completion in title
                document.title = 'Cloth Sim - Seaming Complete!';
            }

            // After seam completion, drop the cloth weight after configured seconds to reduce stretch
            if (this.seamingCompleted && !this.weightDropped) {
                const dropAfter = Math.max(0, this.params.clothWeightDropSeconds ?? 4.0);
                const t0 = this.seamCompleteTime ?? this.timestamp;
                const tSince = Math.max(0, this.timestamp - t0);
                if (tSince >= dropAfter) {
                    if (Compute.clothWeightUniform) {
                        Compute.clothWeightUniform.value = this.params.clothWeightLow ?? 0.35;
                    }
                    this.weightDropped = true;
                }
            }

            // Run collision + integration multiple times to overpower gravity and avoid tunneling
            const iters = Math.max(1, (this.params.collisionIterations | 0));
            for (let i = 0; i < iters; i++) {
                await this.renderer.computeAsync(Compute.computeCollision);
                await this.renderer.computeAsync(Compute.computeVertexForces);
            }

            // Update heatmap uniforms with null checks
            if (Compute.heatmapEnabledUniform) {
                Compute.heatmapEnabledUniform.value = this.params.heatmapEnabled;
            }
            if (Compute.heatmapSensitivityUniform) {
                Compute.heatmapSensitivityUniform.value = this.params.heatmapSensitivity;
            }
            
            // Compute stress values if heatmap is enabled (fallback to vertex-based)
            if (this.params.heatmapEnabled && Compute.computeVertexStress) {
                try {
                    await this.renderer.computeAsync(Compute.computeVertexStress);
                } catch (e) {
                    console.warn('Vertex stress computation failed:', e);
                }
            }
        }

        // Update cloth mesh positions
        this.updateClothPositions(verletVertices);
        // Force material update if heatmap is enabled and buffers have changed
        if (this.params.heatmapEnabled && this.clothMaterial) {
            this.clothMaterial.needsUpdate = true;
        }

        this.clothMesh.material.wireframe = this.params.showWireframe;
        await this.renderer.renderAsync(this.scene, this.camera);
    }

    /** Initialize scene, renderer, camera, lights, and event listeners. */
    init() {
        this.scene = new THREE.Scene();
        // Slightly lighter than clear color to add depth
        // Soft light background to add depth without distracting
        this.scene.background = new THREE.Color(0xeff2f8);
        this.setupRenderer();
        this.setupCameraControls();
        this.setupLights();
        this.setupEventListeners();
    }

    addUpdateCallback(callback) {
        this.updateCallbacks.push(callback);
    }

    setCurrentTopology(vertices, springs) {
        this.currentVerletVertices = vertices;
        this.currentVerletSprings = springs;
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