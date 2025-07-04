import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useCanvasState } from '../state/CanvasState';

export function ThreeDView() {
  /*   const mountRef = useRef<HTMLDivElement>(null);
    const physicsWorld = useRef<any>(null);
    const softBodyHelpers = useRef<any>(null);
    const softBodies = useRef<any[]>([]);
    const meshGroup = useRef<THREE.Group>(new THREE.Group());
    const ammoLib = useRef<any>(null);
    const [ammoReady, setAmmoReady] = useState(false);
  
    const { present } = useCanvasState();
    const { cameraPos, cameraTarget, setCameraPos, setCameraTarget, isSimulationMode } = useCanvasState();
  
    // Initialize Three.js scene and animation loop
    useEffect(() => {
      const container = mountRef.current!;
      const scene = new THREE.Scene();
  
      // Camera
      const camera = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
      );
      camera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);
  
      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);
  
      // Controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.target.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
      controls.addEventListener('change', () => {
        setCameraPos({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
        setCameraTarget({ x: controls.target.x, y: controls.target.y, z: controls.target.z });
      });
  
      // Lighting
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
      const dl = new THREE.DirectionalLight(0xffffff, 0.8);
      dl.position.set(5, 10, 7.5);
      scene.add(dl);
  
      // Add mesh container
      scene.add(meshGroup.current);
  
      // Animation
      const animate = () => {
        controls.update();
        if (ammoReady && isSimulationMode && physicsWorld.current) {
          physicsWorld.current.stepSimulation(1 / 60, 10);
          softBodies.current.forEach((body, idx) => {
            const mesh = meshGroup.current.children[idx] as THREE.Mesh;
            const geometry = mesh.geometry as THREE.BufferGeometry;
            const positions = geometry.attributes.position.array as Float32Array;
            const numVerts = positions.length / 3;
            const nodes = body.get_m_nodes();
            for (let i = 0; i < numVerts; i++) {
              const node = nodes.at(i);
              const pos = node.get_m_x();
              positions[i * 3] = pos.x();
              positions[i * 3 + 1] = pos.y();
              positions[i * 3 + 2] = pos.z();
            }
            geometry.attributes.position.needsUpdate = true;
            geometry.computeVertexNormals();
          });
        }
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      };
      animate();
  
      // Cleanup
      return () => {
        container.removeChild(renderer.domElement);
        renderer.dispose();
        if (ammoLib.current && physicsWorld.current) {
          ammoLib.current.destroy(physicsWorld.current);
        }
      };
    }, [ammoReady, isSimulationMode]);
  
    // Load Ammo.js and initialize physics world
    useEffect(() => {
      import('ammojs3')
        .then((module) => {
          const Ammo = module.default || module;
          ammoLib.current = Ammo;
          softBodyHelpers.current = new Ammo.btSoftBodyHelpers();
  
          // Physics config
          const collisionConfig = new Ammo.btSoftBodyRigidBodyCollisionConfiguration();
          const dispatcher = new Ammo.btCollisionDispatcher(collisionConfig);
          const broadphase = new Ammo.btDbvtBroadphase();
          const solver = new Ammo.btSequentialImpulseConstraintSolver();
          const softSolver = new Ammo.btDefaultSoftBodySolver();
          const world = new Ammo.btSoftRigidDynamicsWorld(
            dispatcher, broadphase, solver, collisionConfig, softSolver
          );
          world.setGravity(new Ammo.btVector3(0, -9.8, 0));
          physicsWorld.current = world;
  
          setAmmoReady(true);
        })
        .catch((err) => {
          console.error('Failed to load Ammo.js:', err);
        });
    }, []);
  
    // Build cloth soft bodies when patterns change
    useEffect(() => {
      if (!ammoReady || !physicsWorld.current || !softBodyHelpers.current) return;
  
      meshGroup.current.clear();
      softBodies.current = [];
  
      present.paths.forEach((path) => {
        if (path.points.length < 3) return;
  
        // Create shape geometry
        const shape = new THREE.Shape();
        const first = path.points[0];
        shape.moveTo(first.x, first.y);
        path.points.slice(1).forEach(pt => shape.lineTo(pt.x, pt.y));
        if (path.closed) shape.closePath();
  
        const geometry = new THREE.ShapeGeometry(shape, 8);
        geometry.computeVertexNormals();
  
        // Mesh
        const material = new THREE.MeshStandardMaterial({
          color: 0xff4444,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        meshGroup.current.add(mesh);
  
        // Ammo soft body
        const verts = geometry.attributes.position.array as Float32Array;
        const indices = geometry.index!.array as Uint16Array;
        const numFaces = indices.length / 3;
        const softBody = softBodyHelpers.current.createFromTriMesh(
          physicsWorld.current.getWorldInfo(), verts, indices, numFaces, true
        );
        const cfg = softBody.get_m_cfg();
        cfg.set_viterations(10);
        cfg.set_piterations(10);
        softBody.setTotalMass(1, false);
  
        physicsWorld.current.addSoftBody(softBody, 1, -1);
        softBodies.current.push(softBody);
      });
    }, [present.paths, ammoReady]); */

  return (
    <iframe src='http://localhost:5500/cloth-ammo/index.html' className='h-full w-full' />
  );
}
