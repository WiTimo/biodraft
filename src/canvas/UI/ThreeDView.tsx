// src/components/ThreeDView.tsx

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { PatternEngine } from '../wasm/cloth_engine';
import { useCanvasState } from '../state/CanvasState';

const EDITOR_W = 800;
const EDITOR_H = 600;

interface Handle { dx: number; dy: number }
interface PointData { id: string; x: number; y: number; handleIn?: Handle; handleOut?: Handle }
interface PathData  { id: string; points: PointData[]; closed: boolean }

export function ThreeDView() {
  const mountRef  = useRef<HTMLDivElement>(null);
  const clothing  = useRef(new THREE.Group());
  const seamGroup = useRef(new THREE.Group());
  const engineRef = useRef<PatternEngine>(new PatternEngine());
  const [bbox, setBbox] = useState({ width: 0, height: 0 });

  

  const {
    isSimulationMode,
    setIsSimulationMode,
    present
  } = useCanvasState();

  const {
    cameraPos,
    cameraTarget,
    setCameraPos,
    setCameraTarget
  } = useCanvasState();

  const paths = useCanvasState(s => s.present.paths);

    useEffect(() => {
      if (bbox.width <= 0 || paths.length === 0) return;

      clothing.current.clear();

      const panels = buildPanels(paths, bbox.width);
      clothing.current.add(panels);

    }, [paths, bbox.width]);

  // Map 2D-Editor-Koordinaten → lokale THREE.Vector3
  const toWorld = (x: number, y: number) => {
    const scale = bbox.width / EDITOR_W;
    const hw = EDITOR_W / 2, hh = EDITOR_H / 2;
    return new THREE.Vector3((x - hw) * scale, (hh - y) * scale, 0);
  };

  // Erzeugt die initialen Panel-Meshes (rot)
  const buildPanels = (paths: PathData[], worldWidth: number) => {
    console.log('[ThreeDView] buildPanels:', paths.length, 'Paths, worldWidth=', worldWidth);
    const group = new THREE.Group();

    for (const path of paths) {
      if (path.points.length < 2) continue;
      const shape = new THREE.Shape();
      const p0 = path.points[0];
      shape.moveTo(...toWorld(p0.x, p0.y).toArray());

      for (let i = 1; i < path.points.length; i++) {
        const prev = path.points[i - 1];
        const cur  = path.points[i];
        const cp1 = toWorld(prev.x + (prev.handleOut?.dx ?? 0), prev.y + (prev.handleOut?.dy ?? 0));
        const cp2 = toWorld(cur.x  + (cur.handleIn?.dx  ?? 0), cur.y  + (cur.handleIn?.dy  ?? 0));
        const next= toWorld(cur.x, cur.y);
        shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, next.x, next.y);
      }

      if (path.closed) {
        shape.closePath();
      }

      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.01,
        bevelEnabled: false,
        curveSegments: 32,
        steps: 1,
      });
      const mat  = new THREE.MeshStandardMaterial({ color: 0xff4444, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);

      mesh.userData.pathId = path.id;
      mesh.scale.set(2, 2, 2);
      group.add(mesh);
    }

    console.log('[ThreeDView] Panels added:', group.children.length);
    return group;
  };

  // ─── Szene initialisieren ────────────────────────────
  useEffect(() => {
    console.log('[ThreeDView] initializing scene');
    const container = mountRef.current!;
    const scene     = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      60, container.clientWidth / container.clientHeight, 0.1, 1000
    );
    camera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
    controls.addEventListener('change', () => {
      setCameraPos({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
      setCameraTarget({ x: controls.target.x, y: controls.target.y, z: controls.target.z });
    });

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5, 10, 7.5);
    scene.add(dl);

    scene.add(clothing.current);
    scene.add(seamGroup.current);

    // Modell + Panels laden
    new GLTFLoader().load('/models/man.glb', gltf => {
      const model = gltf.scene;
      const box   = new THREE.Box3().setFromObject(model);
      const size  = box.getSize(new THREE.Vector3());
      setBbox({ width: size.x, height: size.y });

      model.position.sub(box.getCenter(new THREE.Vector3()));
      const panels = buildPanels(paths, size.x);
      clothing.current.add(panels);
      scene.add(model);

      console.log('[ThreeDView] model + panels ready');
    });

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener('resize', () => {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    });

    return () => {
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // ─── Physics‐Loop ────────────────────────────────────
useEffect(() => {
  // 1) If simulation is off, just clear seams and don’t start a loop
  if (!isSimulationMode) {
    seamGroup.current.clear();
    return;
  }

  const engine = engineRef.current;
  let rafId: number;
  let engineInitialized = false;
  let lastTime = performance.now();

  const tick = (now: number) => {
    // compute dt (clamped if you like)
    const dt = Math.min((now - lastTime) / 1000, /* max_dt? */ 0.016);
    lastTime = now;

    // 2) Detect front/back panels
    const front = present.paths.find(p => p.points.some(pt => pt.x <= 700));
    const back  = present.paths.find(p => p.points.some(pt => pt.x  > 700));
    if (!front || !back) {
      console.warn('[Physics] waiting for both front & back panels…');
    } else {
      // 3) Initialize the engine once
      if (!engineInitialized) {
        const rustSeams = present.seams
          .map(([A, B]) => {
            const isFront = front.points.some(pt => pt.id === A[0]);
            const [from, to] = isFront ? [A, B] : [B, A];
            return {
              from: {
                path_id: front.id,
                start:   front.points.findIndex(pt => pt.id === from[0]),
                end:     front.points.findIndex(pt => pt.id === from[1]),
              },
              to: {
                path_id: back.id,
                start:   back .points.findIndex(pt => pt.id === to  [0]),
                end:     back .points.findIndex(pt => pt.id === to  [1]),
              },
            };
          })
          .filter(s => s.from.start >= 0 && s.to.start >= 0);

        engine.load_json(JSON.stringify({ paths: present.paths, seams: rustSeams }));
        engine.init_physics();
        engineInitialized = true;
      }

      // 4) Step physics
      engine.step_physics(dt);
      const updated: PointData[] = engine.get_physics_positions();
      const posMap = new Map(updated.map(p => [p.id, p] as [string, PointData]));

      // 5) Rebuild cloth meshes
      const panelGroup = clothing.current.children[0] as THREE.Group;
      panelGroup.children.forEach(child => {
        const mesh    = child as THREE.Mesh;
        const pid     = mesh.userData.pathId as string;
        const pattern = present.paths.find(p => p.id === pid)!;

        // build a fresh Shape with handles
        const shape = new THREE.Shape();
        const firstOrig = pattern.points[0];
        const firstPhys = posMap.get(firstOrig.id)!;
        shape.moveTo(...toWorld(firstPhys.x, firstPhys.y).toArray());

        for (let i = 1; i < pattern.points.length; i++) {
          const prevOrig = pattern.points[i - 1];
          const  curOrig = pattern.points[i];
          const prevP    = posMap.get(prevOrig.id)!;
          const  curP    = posMap.get( curOrig.id)!;

          const cp1 = toWorld(
            prevP.x + prevOrig.handleOut.dx,
            prevP.y + prevOrig.handleOut.dy
          );
          const cp2 = toWorld(
            curP.x  +  curOrig.handleIn.dx,
            curP.y  +  curOrig.handleIn.dy
          );
          const end = toWorld(curP.x, curP.y);

          shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
        }
        if (pattern.closed) shape.closePath();

        // replace geometry
        mesh.geometry.dispose();
        mesh.geometry = new THREE.ExtrudeGeometry(shape, {
          depth:         0.01,
          bevelEnabled:  false,
          curveSegments: 32,
          steps:         1,
        });
      });

      // 6) Draw seam lines
      seamGroup.current.clear();
      present.seams.forEach(([A, B]) => {
        [0, 1].forEach(k => {
          const a = posMap.get(A[k])!;
          const b = posMap.get(B[k])!;
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              toWorld(a.x, a.y), toWorld(b.x, b.y)
            ]),
            new THREE.LineBasicMaterial({ color: 0x0000ff })
          );
          seamGroup.current.add(line);
        });
      });
    }

    // queue next frame
    rafId = requestAnimationFrame(tick);
  };

  // start the loop
  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);

}, [isSimulationMode, present.paths, present.seams, bbox.width]);


  return (
    <div className="h-full w-full relative">
      <button
        onClick={() => setIsSimulationMode(!isSimulationMode)}
        className="absolute top-2 left-2 z-50 p-2 border-2 rounded-lg"
        style={{ backgroundColor: isSimulationMode ? '#193cb8' : 'transparent' }}
      >
        {isSimulationMode ? 'Pause' : 'Simulieren'}
      </button>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
