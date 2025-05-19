// src/components/ThreeDView.tsx

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Clock, AnimationMixer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useCanvasState } from '../state/CanvasState';

import init, { PatternEngine } from '../wasm/cloth_engine';

function toWorldCoords(x: number, y: number, bboxWidth: number): THREE.Vector3 {
  const pxToWorld = bboxWidth / EDITOR_W;
  const halfW = EDITOR_W / 2;
  const halfH = EDITOR_H / 2;
  return new THREE.Vector3(
    (x - halfW) * pxToWorld,
    (halfH - y) * pxToWorld,
    0
  );
}


// ────────────────────────────
// **FIXED** internal editor resolution
const EDITOR_W = 800;
const EDITOR_H = 600;
// ────────────────────────────

interface Handle   { dx: number; dy: number }
interface PointData { id: string; x: number; y: number; handleIn?: Handle; handleOut?: Handle }
interface PathData  { id: string; points: PointData[]; closed: boolean }

/**
 * Build a set of extruded meshes from 2D Paths,
 * mapping editor-pixel coords → world-space with a uniform scale.
 */
function buildClothingMesh(
  paths: PathData[],
  bboxWidth: number
): THREE.Group {
  const group = new THREE.Group();

  // 1px→world units
  const pxToWorld = bboxWidth / EDITOR_W;
  const halfW     = EDITOR_W / 2;
  const halfH     = EDITOR_H / 2;

  // convert editor (x,y) → world (X,Y)
  const toVec2 = (pt: { x: number; y: number }) =>
    new THREE.Vector2(
      (pt.x - halfW) * pxToWorld,
      (halfH - pt.y) * pxToWorld
    );

  for (const path of paths) {
    if (path.points.length < 2) continue;

    // still decide “back” by your 700px rule
    const isBack = path.points.some(pt => pt.x > 700);

    // build the 2D shape as before
    const shape = new THREE.Shape();
    shape.moveTo(...toVec2(path.points[0]).toArray());
    for (let i = 1; i < path.points.length; i++) {
      const prev = path.points[i - 1];
      const cur  = path.points[i];

      const cp1 = {
        x: prev.x + (prev.handleOut?.dx || 0),
        y: prev.y + (prev.handleOut?.dy || 0),
      };
      const cp2 = {
        x: cur.x + (cur.handleIn?.dx || 0),
        y: cur.y + (cur.handleIn?.dy || 0),
      };

      const isCurve =
        cp1.x !== prev.x || cp1.y !== prev.y ||
        cp2.x !== cur.x  || cp2.y !== cur.y;

      if (isCurve) {
        shape.bezierCurveTo(
          ...toVec2(cp1).toArray(),
          ...toVec2(cp2).toArray(),
          ...toVec2(cur).toArray()
        );
      } else {
        shape.lineTo(...toVec2(cur).toArray());
      }
    }
    if (path.closed) shape.closePath();

    // extrude & material
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.01,
      bevelEnabled: false,
      curveSegments: 32,
      steps: 1,
    });
    const mat  = new THREE.MeshStandardMaterial({
      color: 0xff4444,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);

    const sx = isBack ? -2 : 2;
    mesh.scale.set(sx, 2, 2);

    let px = 0;
    let py = 0;
    let pz = 0;
    if(!isBack){
      px = 3.1;
      py = 3.0;
      pz = 0.75;
    }else{
      px = 7.1
      py = 3.0;
      pz = -0.75;
    }
    mesh.position.set(px, py, pz);

    group.add(mesh);
  }

  return group;
}


export function ThreeDView() {
  const mountRef      = useRef<HTMLDivElement>(null);
  const clothingGroup = useRef(new THREE.Group());
  const mixerRef      = useRef<AnimationMixer>();
  const clockRef      = useRef(new Clock());

  const seamGroup = useRef(new THREE.Group());

  const [simulatedPaths, setSimulatedPaths] = useState<PathData[] | null>(null);
  const {isSimulationMode, setIsSimulationMode, present} = useCanvasState();

  // will hold your model’s measured world-space size
  const [bbox, setBbox] = useState({ width: 0, height: 0 });

  // persistent camera data in your zustand store
  const { cameraPos, cameraTarget, setCameraPos, setCameraTarget } =
    useCanvasState();

  // raw 2D paths from your editor, in pixel coords
  const paths = useCanvasState(s => s.present.paths);

  // ─── one‐time setup: scene, camera, renderer, controls, load model ──────────
  useEffect(() => {
    const container = mountRef.current!;
    const scene     = new THREE.Scene();

    // camera
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);

    // renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
    controls.update();

    const onChange = () => {
      setCameraPos({
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      });
      setCameraTarget({
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z,
      });
    };
    controls.addEventListener('change', onChange);

    // lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    // placeholder for your shapes
    scene.add(clothingGroup.current);

    // load + center model → measure bbox → parent clothingGroup
    new GLTFLoader().load('/models/man.glb', (gltf) => {
      const model = gltf.scene;
      const box   = new THREE.Box3().setFromObject(model);
      const size  = box.getSize(new THREE.Vector3());
      setBbox({ width: size.x, height: size.y });

      // center the model at origin
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);

      model.add(clothingGroup.current);
      scene.add(model);

      scene.add(seamGroup.current);
      // freeze first frame of any animation
      const mixer = new AnimationMixer(model);
      mixerRef.current = mixer;
      if (gltf.animations.length) {
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
        mixer.update(0);
      }
    });

    // animation loop
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    // handle resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('change', onChange);
      container.removeChild(renderer.domElement);
      seamGroup.current.clear();
      renderer.dispose();
    };
  }, []);

  // ─── rebuild clothing meshes whenever paths change or bbox is set ────────────
  useEffect(() => {
    if (bbox.width === 0 || bbox.height === 0) return;

    const group = clothingGroup.current;
    // dispose old geometry/materials
    group.children.forEach((m: any) => {
      m.geometry.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach((mt: any) => mt.dispose());
      } else {
        m.material.dispose();
      }
    });
    group.clear();

    // rebuild with uniform pixel scale
    const newGroup = buildClothingMesh(paths, bbox.width, bbox.height);
    group.add(...newGroup.children);
  }, [paths, bbox]);

  // 🧠 Load paths from WASM when simulation mode is turned on
  useEffect(() => {
    if (!isSimulationMode) {
      setSimulatedPaths(null);
      return;
    }

    try {
      
      const engine = new PatternEngine();
      const [ frontPath, backPath ] = present.paths;

    // turn your raw ID‐pairs into exactly the shape Rust wants:
    const rustSeams = (present.seams as [ [string, string], [string, string] ][]).map(
      ([[fromIdStart, fromIdEnd], [toIdStart, toIdEnd]]) => ({
        from: {
          path_id: frontPath.id,
          start:  frontPath.points.findIndex(pt => pt.id === fromIdStart),
          end:    frontPath.points.findIndex(pt => pt.id === fromIdEnd),
        },
        to: {
          path_id: backPath.id,
          start:  backPath.points.findIndex(pt => pt.id === toIdStart),
          end:    backPath.points.findIndex(pt => pt.id === toIdEnd),
        },
      })
    );

    // now build the exact JSON Rust expects:
    const engineInput = {
      paths: present.paths,
      seams: rustSeams,
    };

    engine.load_json(JSON.stringify(engineInput));
      const result = engine.get_json();
      setSimulatedPaths(result.paths);

      const resolvedSeams = engine.get_resolved_seams_json();

      // Each seam: { from_points: [...], to_points: [...] }
      resolvedSeams.forEach((seam: any) => {
        drawLinePairs(seam.from_points, seam.to_points);
      });


      function drawLinePairs(from: { x: number, y: number }[], to: { x: number, y: number }[]) {
        seamGroup.current.clear();

        for (let i = 0; i < Math.min(from.length, to.length); i++) {
          const fromVec = toWorldCoords(from[i].x, from[i].y, bbox.width);
          const toVec = toWorldCoords(to[i].x, to[i].y, bbox.width);

          const geometry = new THREE.BufferGeometry().setFromPoints([fromVec, toVec]);
          const material = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
          const line = new THREE.Line(geometry, material);

          seamGroup.current.add(line);
        }
      }

    } catch (err) {
      console.error("❌ WASM JSON roundtrip error:", err);
    }
  }, [isSimulationMode, present]);

  // 🧱 Build clothing group using either JS paths or simulated Rust paths
  useEffect(() => {
    if (bbox.width === 0 || bbox.height === 0) return;

    const group = clothingGroup.current;
    // Clean up old meshes
    group.children.forEach((m: any) => {
      m.geometry.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach((mt: any) => mt.dispose());
      } else {
        m.material.dispose();
      }
    });
    group.clear();

    // Use simulation result if available
    const activePaths = isSimulationMode && simulatedPaths ? simulatedPaths : paths;

    const newGroup = buildClothingMesh(activePaths, bbox.width);
    group.add(...newGroup.children);
  }, [paths, simulatedPaths, bbox, isSimulationMode]);


  return <div className='h-full w-full relative'>
    <button className='absolute top-0 left-0 z-[2000] text-white' onClick={() => setIsSimulationMode(!isSimulationMode)}>
      {isSimulationMode ? "Simulation" : "Modeling"}
    </button>
    <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
  </div> 
}
