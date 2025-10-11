import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getCurrentModelURL } from './modelStore.js';
import { SETTINGS } from '../settings.js';

/** Compute axis-aligned bounding box for any Object3D subtree. */
function getSceneBounds(obj3d) {
  return new THREE.Box3().setFromObject(obj3d);
}

/**
 * Normalize the human: scale to target height (from localStorage or SETTINGS)
 * and vertically align so the head top matches SETTINGS.HUMAN_REF_TOP_Y.
 */
function normalizeScaleAndHead(scene) {
  // Current bbox before normalization
  let box = getSceneBounds(scene);
  const curHeightUnits = box.max.y - box.min.y;
  const curTopY = box.max.y;
  if (!(curHeightUnits > 0)) return;

  // Load user target height (still from UI settings if present, else from SETTINGS)
  const s = (() => { try { return JSON.parse(localStorage.getItem('humanSettings') ?? 'null'); } catch { return null; } })();
  const targetHeightCm = (s && Number.isFinite(s.height_cm)) ? s.height_cm : SETTINGS.HUMAN_REF_HEIGHT_CM;
  const targetHeightM = targetHeightCm / 100;
  // Use fixed calibration from settings
  const refTopY = SETTINGS.HUMAN_REF_TOP_Y;
  const refHU = SETTINGS.HUMAN_REF_HEIGHT_UNITS;
  const unitsPerM = SETTINGS.HUMAN_UNITS_PER_METER;
  if (!(unitsPerM > 0 && Number.isFinite(refTopY) && Number.isFinite(refHU))) return;

  // 1) Scale to desired person height (scene units)
  const desiredUnits = targetHeightM * unitsPerM;
  const scaleFactor = desiredUnits / curHeightUnits;
  if (scaleFactor > 0 && Math.abs(scaleFactor - 1) > 1e-6) {
    scene.scale.multiplyScalar(scaleFactor);
    scene.updateMatrixWorld(true);
    box = getSceneBounds(scene);
  }

  // 2) Head anchor: move so the top (head) matches the reference head Y
  const newTopY = box.max.y;
  const dy = refTopY - newTopY;
  if (Math.abs(dy) > 1e-12) {
    scene.position.y += dy;
    scene.updateMatrixWorld(true);
  }
}

/** Expand a triangle mesh along normals by a small thickness (Float32Array in, out). */
export function createThickenedCollider(positions, indices, thickness = SETTINGS.PARAMS.colliderThickness) {
  // Create a geometry from the original positions and indices
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

/** Build a btBvhTriangleMeshShape collider from positions/indices using Ammo.js. */
function createAmmoCollider(positions, indices, thickness = SETTINGS.PARAMS.colliderThickness) {
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

/**
 * Create debug meshes:
 * - colliderMesh: thickened wireframe
 * - debugMesh: original merged geometry wireframe
 */
export function createDebugVisualization(mergedGeometry, positions, indices, thickness = SETTINGS.PARAMS.colliderThickness) {
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

/** Visualize the dynamic collider positions as a wireframe mesh. */
export function createDynamicDebugVisualization(dynamicCollider, indices) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(dynamicCollider.positions, 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
    opacity: 0.3,
    transparent: true,
    depthTest: false
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** Minimal probe to detect bone movement over time (for debugging). */
export function createBoneProbe(skinnedMesh) {
  if (!skinnedMesh || !skinnedMesh.skeleton) return null;
  const skel = skinnedMesh.skeleton;
  // Prefer a central bone like Hips/Root if present
  let target = skel.bones.find(b => /hips|root/i.test(b.name)) || skel.bones[0];
  if (!target) return null;
  let lastQ = new THREE.Quaternion().copy(target.quaternion);
  let lastP = new THREE.Vector3().copy(target.getWorldPosition(new THREE.Vector3()))
  let t = 0;
  return {
    update(dt) {
      t += dt;
      if (t < 1.0) return;
      t = 0;
      const p = target.getWorldPosition(new THREE.Vector3());
      const q = target.getWorldQuaternion(new THREE.Quaternion());
      const moved = p.distanceTo(lastP) > 1e-5 || 1 - Math.abs(q.dot(lastQ)) > 1e-5;
      lastP.copy(p); lastQ.copy(q);
    }
  };
}

/** Load the GLB from IndexedDB/fallback, preserve materials, and prepare animation. */
export async function loadHumanModel() {
  const { url, revoke } = await getCurrentModelURL();
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        gltf.scene.scale.set(SETTINGS.HUMAN_SCALE.x, SETTINGS.HUMAN_SCALE.y, SETTINGS.HUMAN_SCALE.z);
        gltf.scene.position.set(SETTINGS.HUMAN_POSITION.x, SETTINGS.HUMAN_POSITION.y, SETTINGS.HUMAN_POSITION.z);
        gltf.scene.updateMatrixWorld(true);

        normalizeScaleAndHead(gltf.scene);

        // Materials: keep original textures/shaders when present.
        // Only apply a neutral MeshStandard fallback if a mesh lacks a usable material.
        gltf.scene.traverse(object => {
          if (object.isMesh) {
            const mat = object.material;
            if (Array.isArray(mat)) return; // respect multi-materials as-is
            if (mat) {
              // If material already PBR or has a map, keep it—just ensure double sided for thin shells.
              const hasMap = !!mat.map;
              const isPBR = mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial;
              if (hasMap || isPBR) {
                mat.side = THREE.DoubleSide;
                if (object.isSkinnedMesh && mat.skinning !== undefined) mat.skinning = true;
              } else {
                // Fallback neutral material
                object.material = new THREE.MeshStandardMaterial({
                  color: 0xcccccc,
                  roughness: 0.6,
                  metalness: 0.0,
                  side: THREE.DoubleSide,
                  skinning: !!object.isSkinnedMesh
                });
              }
            } else {
              object.material = new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                roughness: 0.6,
                metalness: 0.0,
                side: THREE.DoubleSide,
                skinning: !!object.isSkinnedMesh
              });
            }
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

        let firstSkinnedMesh = null;
        gltf.scene.traverse(o => {
          if (!firstSkinnedMesh && o.isSkinnedMesh && o.skeleton) firstSkinnedMesh = o;
        });

        let skelRoot = null;
        if (firstSkinnedMesh && firstSkinnedMesh.skeleton) {
          const bones = firstSkinnedMesh.skeleton.bones;
          const roots = bones.filter(b => !b.parent || !b.parent.isBone);
          skelRoot = roots[0] || bones[0] || null;
        }

  let mixer = null;
  const animationsAllowed = !!(SETTINGS?.PARAMS?.animationsEnabled);
  if (animationsAllowed && gltf.animations && gltf.animations.length > 0) {
          // Choose mixer root by measuring how many track node paths resolve from each candidate root
          function countResolvedBindings(root, clips) {
            if (!root || !clips || !clips.length) return 0;
            let resolved = 0;
            for (const clip of clips) {
              for (const t of clip.tracks) {
                const full = t.name || '';
                const dot = full.lastIndexOf('.');
                const nodePath = dot >= 0 ? full.slice(0, dot) : full;
                const node = THREE.PropertyBinding.findNode(root, nodePath);
                if (node) resolved++;
              }
            }
            return resolved;
          }

          const sceneResolved = countResolvedBindings(gltf.scene, gltf.animations);
          const skelResolved = countResolvedBindings(skelRoot, gltf.animations);
          const mixerRoot = (skelResolved > sceneResolved && skelRoot) ? skelRoot : gltf.scene;
          mixer = new THREE.AnimationMixer(mixerRoot);
          // Setup animations
          const actions = [];
          gltf.animations.forEach(clip => {
            const action = mixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.enabled = true;
            action.clampWhenFinished = false;
            action.reset();
            if (animationsAllowed) action.play();
            actions.push(action);
          });
          mixer.timeScale = 1.0;
          mixer.__actions = actions;
        }

        const result = {
          mergedGeometry,
          positions,
          indices,
          gltfScene: gltf.scene,
          animations: gltf.animations || [],
          mixer,
          firstSkinnedMesh
        };
        if (revoke) revoke();
        resolve(result);
      },
      undefined,
      (error) => {
        if (revoke) revoke();
        reject(error);
      }
    );
  });
}

/** Attach collider to physics world and configure compute collider buffers. */
export function setupHumanCollision(mergedGeometry, positions, indices, scene, physicsWorld, Compute, thickness = SETTINGS.PARAMS.colliderThickness) {
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

/** Convenience: load human, add to scene, set up collision, and create debug visuals. */
export async function loadHumanAndSetupCollision(scene, physicsWorld, Compute, thickness = SETTINGS.PARAMS.colliderThickness) {
  try {
    const { mergedGeometry, positions, indices, gltfScene, animations, mixer, firstSkinnedMesh } = await loadHumanModel();
    scene.add(gltfScene);
    const { collisionBody, optimizedGeometry, colliderMesh } = setupHumanCollision(
      mergedGeometry, positions, indices, scene, physicsWorld, Compute, thickness
    );

    let dynamicCollider = buildDynamicColliderFromScene(gltfScene, thickness);
    // Initialize compute buffers with current animated pose
    if (dynamicCollider && dynamicCollider.indices && dynamicCollider.positions) {
      Compute.setupColliderBuffers({ positions: dynamicCollider.positions, indices: dynamicCollider.indices });
    }

    // Visualization: prefer dynamic collider wireframe if available
    let debugColliderMesh, debugMesh;
    if (dynamicCollider) {
      debugColliderMesh = createDynamicDebugVisualization(dynamicCollider, dynamicCollider.indices);
      scene.add(debugColliderMesh);
    } else {
      const vis = createDebugVisualization(optimizedGeometry, positions, indices, thickness);
      debugColliderMesh = vis.colliderMesh;
      debugMesh = vis.debugMesh;
      scene.add(debugColliderMesh);
      scene.add(debugMesh);
    }

    return {
      collisionBody,
      bvhVisualization: null,
      optimizedGeometry,
      positions,
      indices,
      gltfScene,
      animations,
      colliderMesh: debugColliderMesh,
      debugMesh,
      mixer,
      dynamicCollider,
      firstSkinnedMesh
    };
  } catch (error) {
    throw error;
  }
}

// Recompute collider arrays from current animated pose (CPU, brute-force)
/** Bake the current animated pose to collider arrays (CPU path). */
export function getCurrentColliderDataFromScene(gltfScene, thickness = SETTINGS.PARAMS.colliderThickness) {
  try {
    const baked = bakeMergedWorldGeometry(gltfScene);
    if (!baked) return null;
    const { mergedGeometry, positions, indices } = baked;
    const thickenedPositions = createThickenedCollider(positions, indices, thickness);
    return { positions: thickenedPositions, indices: new Uint32Array(indices), mergedGeometry };
  } catch (error) {
    return null;
  }
}

// --- Dynamic collider extraction for animated models ---
/**
 * Build combined positions/indices buffers from a potentially animated scene.
 * - Skinned meshes are evaluated via boneTransform (with a robust fallback)
 * - Positions are in world space and get normal-based thickness applied
 */
export function buildDynamicColliderFromScene(root, thickness = SETTINGS.PARAMS.colliderThickness) {
  // Gather meshes and allocate flat buffers for positions and indices
  const entries = [];
  let totalVerts = 0;
  let skinnedCount = 0;
  let staticCount = 0;
  const tmpVec = new THREE.Vector3();
  const tmpWorld = new THREE.Vector3();

  root.updateMatrixWorld(true);
  root.traverse(obj => {
    if (!(obj.isMesh || obj.isSkinnedMesh)) return;
    const geom = obj.geometry;
    if (!geom || !geom.attributes || !geom.attributes.position) return;

    const posAttr = geom.attributes.position;
    const vertCount = posAttr.count;
    if (!Number.isFinite(vertCount) || vertCount <= 0) return;

    let idxArray;
    if (geom.index) {
      // Use existing indices
      const src = geom.index.array;
      idxArray = (src instanceof Uint32Array) ? src : new Uint32Array(src);
    } else {
      // Generate sequential triangle indices (assumes triangles)
      const count = vertCount;
      idxArray = new Uint32Array(count);
      for (let i = 0; i < count; i++) idxArray[i] = i;
    }

    const isSkinned = !!obj.isSkinnedMesh;
    const hasSkinAttrs = !!(geom.attributes.skinIndex && geom.attributes.skinWeight);
    const hasSkeleton = !!obj.skeleton;
    const hasBoneTransform = !!obj.boneTransform;

    if (isSkinned && !hasBoneTransform) {
      // Add corrected boneTransform method with proper matrix operation order
      obj.boneTransform = function (index, target) {
        if (!this.skeleton || !this.geometry.attributes.skinIndex || !this.geometry.attributes.skinWeight) {
          // Fallback: Original Position
          target.fromBufferAttribute(this.geometry.attributes.position, index);
          return target;
        }

        const position = this.geometry.attributes.position;
        const skinIndex = this.geometry.attributes.skinIndex;
        const skinWeight = this.geometry.attributes.skinWeight;

        // Original Position
        const originalPos = new THREE.Vector3();
        originalPos.fromBufferAttribute(position, index);

        // Skinning Data
        const indices = new THREE.Vector4();
        const weights = new THREE.Vector4();
        indices.fromBufferAttribute(skinIndex, index);
        weights.fromBufferAttribute(skinWeight, index);

        // Apply corrected skinning formula: sum(weight[i] * boneMatrix[i] * boneInverse[i] * originalPosition)
        target.set(0, 0, 0);

        for (let i = 0; i < 4; i++) {
          const weight = weights.getComponent(i);
          if (weight > 0) {
            const boneIndex = Math.floor(indices.getComponent(i));
            if (boneIndex >= 0 && boneIndex < this.skeleton.bones.length) {
              const tempVec = originalPos.clone();

              // Note: This fallback yields WORLD-SPACE directly
              // Apply bone inverse then bone world to get world-space contribution
              tempVec.applyMatrix4(this.skeleton.boneInverses[boneIndex]);
              tempVec.applyMatrix4(this.skeleton.bones[boneIndex].matrixWorld);
              tempVec.multiplyScalar(weight);

              target.add(tempVec);
            }
          }
        }

        return target;
      };
      // Mark that our fallback returns world-space positions
      obj.__boneTransformReturnsWorld = true;
    }

    entries.push({ mesh: obj, isSkinned, hasSkinAttrs, hasSkeleton, hasBoneTransform, posAttr, idxArray, base: totalVerts, vertCount });
    if (isSkinned) skinnedCount++; else staticCount++;
    totalVerts += vertCount;
  });

  if (entries.length === 0 || totalVerts === 0) {
    return null;
  }

  // Build a single index buffer across all entries
  let totalIndices = 0;
  for (const e of entries) totalIndices += e.idxArray.length;
  const combinedIndices = new Uint32Array(totalIndices);
  {
    let off = 0;
    for (const e of entries) {
      const src = e.idxArray;
      for (let i = 0; i < src.length; i++) combinedIndices[off++] = src[i] + e.base;
    }
  }

  // Positions buffer that will be updated every frame
  const combinedPositions = new Float32Array(totalVerts * 3);
  // Scratch normals buffer for per-frame thickness application
  const combinedNormals = new Float32Array(totalVerts * 3);

  const update = () => {
    root.updateMatrixWorld(true);
    for (const e of entries) {
      const { mesh, isSkinned, posAttr, base, vertCount } = e;
      const m = mesh.matrixWorld;

      if (isSkinned && mesh.boneTransform) {
        // Make sure bone matrices are up to date before sampling skinning
        if (mesh.skeleton && mesh.skeleton.update) mesh.skeleton.update();
        // Compute skinned local position then transform to world
        const arr = posAttr.array;
        for (let i = 0; i < vertCount; i++) {
          const k = i * 3;
          tmpVec.set(arr[k], arr[k + 1], arr[k + 2]);
          mesh.boneTransform(i, tmpVec);
          // If our fallback returns world-space, skip applying matrixWorld again
          if (mesh.__boneTransformReturnsWorld) {
            tmpWorld.copy(tmpVec);
          } else {
            tmpWorld.copy(tmpVec).applyMatrix4(m);
          }
          const j = (base + i) * 3;
          combinedPositions[j] = tmpWorld.x;
          combinedPositions[j + 1] = tmpWorld.y;
          combinedPositions[j + 2] = tmpWorld.z;
        }
      } else {
        // Static mesh: transform original positions by matrixWorld
        const arr = posAttr.array;
        for (let i = 0; i < vertCount; i++) {
          const k = i * 3;
          tmpWorld.set(arr[k], arr[k + 1], arr[k + 2]).applyMatrix4(m);
          const j = (base + i) * 3;
          combinedPositions[j] = tmpWorld.x;
          combinedPositions[j + 1] = tmpWorld.y;
          combinedPositions[j + 2] = tmpWorld.z;
        }
      }
    }
    // Reapply thickness every frame using CPU-computed vertex normals (no geometry mutation)
    if (thickness && thickness > 0) {
      // Zero normals
      combinedNormals.fill(0);
      // Accumulate face normals
      for (let t = 0; t < combinedIndices.length; t += 3) {
        const ia = combinedIndices[t] * 3;
        const ib = combinedIndices[t + 1] * 3;
        const ic = combinedIndices[t + 2] * 3;

        const ax = combinedPositions[ia], ay = combinedPositions[ia + 1], az = combinedPositions[ia + 2];
        const bx = combinedPositions[ib], by = combinedPositions[ib + 1], bz = combinedPositions[ib + 2];
        const cx = combinedPositions[ic], cy = combinedPositions[ic + 1], cz = combinedPositions[ic + 2];

        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;

        // Face normal = AB x AC
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;

        combinedNormals[ia] += nx; combinedNormals[ia + 1] += ny; combinedNormals[ia + 2] += nz;
        combinedNormals[ib] += nx; combinedNormals[ib + 1] += ny; combinedNormals[ib + 2] += nz;
        combinedNormals[ic] += nx; combinedNormals[ic + 1] += ny; combinedNormals[ic + 2] += nz;
      }

      // Normalize and offset positions
      for (let i = 0; i < combinedPositions.length; i += 3) {
        let nx = combinedNormals[i];
        let ny = combinedNormals[i + 1];
        let nz = combinedNormals[i + 2];
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-12) {
          nx /= len; ny /= len; nz /= len;
          combinedPositions[i] += nx * thickness;
          combinedPositions[i + 1] += ny * thickness;
          combinedPositions[i + 2] += nz * thickness;
        }
      }
    }
  };

  update();

  return {
    positions: combinedPositions,
    indices: combinedIndices,
    update
  };
}