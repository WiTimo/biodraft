import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const HUMAN_MODEL_PATH = './models/man_watertight.glb';
const HUMAN_SCALE = { x: 0.25, y: 0.25, z: 0.25 };
const HUMAN_POSITION = { x: 0, y: -0.8, z: 0 };
const COLLIDER_THICKNESS = 0.015;

export function createThickenedCollider(positions, indices, thickness = COLLIDER_THICKNESS) {
    //Create a geometry from the original positions and indices
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    
    // Compute vertex normals for expansion
    geometry.computeVertexNormals();
    const normals = geometry.attributes.normal.array;
    
    // Create thickened positions by expanding along normals
    const thickenedPositions = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
        const normalX = normals[i];
        const normalY = normals[i + 1];
        const normalZ = normals[i + 2];
        
        // Expand outward along the normal
        thickenedPositions[i] = positions[i] + normalX * thickness;
        thickenedPositions[i + 1] = positions[i + 1] + normalY * thickness;
        thickenedPositions[i + 2] = positions[i + 2] + normalZ * thickness;
    }
    
    return thickenedPositions;
}

function createAmmoCollider(positions, indices, thickness = COLLIDER_THICKNESS) {
    const triangleMesh = new Ammo.btTriangleMesh();
    
    // Create thickened positions
    const thickenedPositions = createThickenedCollider(positions, indices, thickness);

    // Convert geometry triangles to Ammo.js triangle mesh with thickening
    for (let triangleIndex = 0; triangleIndex < indices.length; triangleIndex += 3) {
        // Get vertex indices for this triangle (each vertex index points to 3 consecutive position values)
        const vertexAIndex = indices[triangleIndex] * 3;
        const vertexBIndex = indices[triangleIndex + 1] * 3;
        const vertexCIndex = indices[triangleIndex + 2] * 3;

        // Create Ammo.js vectors for each triangle vertex with thickening applied
        const vertexA = new Ammo.btVector3(
            thickenedPositions[vertexAIndex], 
            thickenedPositions[vertexAIndex + 1], 
            thickenedPositions[vertexAIndex + 2]
        );
        const vertexB = new Ammo.btVector3(
            thickenedPositions[vertexBIndex], 
            thickenedPositions[vertexBIndex + 1], 
            thickenedPositions[vertexBIndex + 2]
        );
        const vertexC = new Ammo.btVector3(
            thickenedPositions[vertexCIndex], 
            thickenedPositions[vertexCIndex + 1], 
            thickenedPositions[vertexCIndex + 2]
        );
        triangleMesh.addTriangle(vertexA, vertexB, vertexC, true);
    }

    // Use Ammo.js built-in BVH optimization - much simpler and more efficient
    // The btBvhTriangleMeshShape automatically creates an optimized BVH structure
    const collisionShape = new Ammo.btBvhTriangleMeshShape(triangleMesh, true, true);
    const motionState = new Ammo.btDefaultMotionState();
    const rigidBodyInfo = new Ammo.btRigidBodyConstructionInfo(
        0, motionState, collisionShape, new Ammo.btVector3(0, 0, 0)
    );
    const collisionBody = new Ammo.btRigidBody(rigidBodyInfo);
    return collisionBody;
}

export function createDebugVisualization(mergedGeometry, positions, indices, thickness = COLLIDER_THICKNESS) {
    // Create thickened collider geometry for debug visualization
    const thickenedPositions = createThickenedCollider(positions, indices, thickness);

    const colliderGeometry = new THREE.BufferGeometry();
    colliderGeometry.setAttribute('position', new THREE.BufferAttribute(thickenedPositions, 3));
    colliderGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

    const colliderMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        opacity: 0.3,
        transparent: true
    });

    const debugMaterial = new THREE.MeshBasicMaterial({
        wireframe: true,
        opacity: 0.3,
        transparent: true
    });

    return {
        colliderMesh: new THREE.Mesh(colliderGeometry, colliderMaterial),
        debugMesh: new THREE.Mesh(mergedGeometry, debugMaterial)
    };
}

export async function loadHumanModel() {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(
            HUMAN_MODEL_PATH,
            (gltf) => {
                gltf.scene.scale.set(HUMAN_SCALE.x, HUMAN_SCALE.y, HUMAN_SCALE.z);
                gltf.scene.position.set(HUMAN_POSITION.x, HUMAN_POSITION.y, HUMAN_POSITION.z);
                gltf.scene.updateMatrixWorld(true);

                // Fix materials to make them more visible
                gltf.scene.traverse(object => {
                    if (object.isMesh && object.material) {
                        // Create a new material that responds better to lighting
                        const newMaterial = new THREE.MeshStandardMaterial({
                            color: 0x808080, // Light gray color
                            roughness: 0.5,
                            metalness: 0.1,
                            side: THREE.DoubleSide
                        });
                        object.material = newMaterial;
                    }
                });

                const geoms = [];
                gltf.scene.traverse(object => {
                    if (object.isMesh && object.geometry) {
                        const geometry = object.geometry.clone();
                        geometry.applyMatrix4(object.matrixWorld);
                        geoms.push(geometry);
                    }
                });

                // Merge geometries
                const mergedGeometry = BufferGeometryUtils.mergeGeometries(geoms, false);
                const positions = mergedGeometry.attributes.position.array;
                let indices = mergedGeometry.index ? mergedGeometry.index.array : null;
                if (!indices) {
                    const vertexCount = positions.length / 3;
                    indices = new Uint32Array(vertexCount);
                    for (let i = 0; i < vertexCount; i++) {
                        indices[i] = i;
                    }
                }

                resolve({
                    mergedGeometry,
                    positions,
                    indices,
                    gltfScene: gltf.scene
                });
            },
            undefined,
            (error) => reject(new Error(`Failed to load human model: ${error.message}`))
        );
    });
}

export function setupHumanCollision(mergedGeometry, positions, indices, scene, physicsWorld, Compute, thickness = COLLIDER_THICKNESS) {
    // Create collider mesh for visualization (simplified - no BVH visualization)
    const colliderMesh = new THREE.Mesh(
        mergedGeometry,
        new THREE.MeshBasicMaterial({ visible: false })
    );
    scene.add(colliderMesh);

    // Create Ammo.js collision body with built-in BVH optimization
    const collisionBody = createAmmoCollider(positions, indices, thickness);
    physicsWorld.addRigidBody(collisionBody);

    // Setup compute buffers with thickened positions for collision detection
    const thickenedPositions = createThickenedCollider(positions, indices, thickness);

    // Simplified setup - no complex BVH bounds needed
    Compute.setupColliderBuffers({
        positions: thickenedPositions,
        indices: new Uint32Array(indices)
    });

    return {
        collisionBody,
        bvhVisualization: null, // No BVH visualization needed
        optimizedGeometry: mergedGeometry,
        positions: thickenedPositions,
        indices,
        colliderMesh
    };
}

export async function loadHumanAndSetupCollision(scene, physicsWorld, Compute, thickness = COLLIDER_THICKNESS) {
    try {
        const { mergedGeometry, positions, indices, gltfScene } = await loadHumanModel();

        // Add the model to the scene
        scene.add(gltfScene);

        // Setup collision detection with Ammo.js optimization
        const { collisionBody, optimizedGeometry, colliderMesh } = setupHumanCollision(
            mergedGeometry, positions, indices, scene, physicsWorld, Compute, thickness
        );

        // Create debug visualizations
        const { colliderMesh: debugColliderMesh, debugMesh } = createDebugVisualization(optimizedGeometry, positions, indices, thickness);
        scene.add(debugColliderMesh);
        scene.add(debugMesh);

        return {
            collisionBody,
            bvhVisualization: null,
            optimizedGeometry,
            positions,
            indices,
            gltfScene,
            colliderMesh: debugColliderMesh,
            debugMesh
        };
    } catch (error) {
        console.error('Error loading human model:', error);
        throw error;
    }
}