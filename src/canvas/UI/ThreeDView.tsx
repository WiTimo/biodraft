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
  const mountRef   = useRef<HTMLDivElement>(null);
  const sceneRef   = useRef<THREE.Scene>();
  const clothing   = useRef(new THREE.Group());
  const seamGroup  = useRef(new THREE.Group());
  const mixerRef   = useRef<THREE.AnimationMixer>();

  const [bbox, setBbox] = useState({ width: 0, height: 0 });
  const { isSimulationMode, setIsSimulationMode, present } = useCanvasState();
  const { cameraPos, cameraTarget, setCameraPos, setCameraTarget } = useCanvasState();
  const paths = useCanvasState(s => s.present.paths);

  // Convert editor X,Y → local‐plane coordinates
  function toWorld(x: number, y: number) {
    const s  = bbox.width / EDITOR_W;
    const hw = EDITOR_W / 2, hh = EDITOR_H / 2;
    return new THREE.Vector3((x - hw) * s, (hh - y) * s, 0);
  }

  // Build your red extruded panels
  function buildPanels(paths: PathData[], w: number) {
    console.log('[ThreeDView] buildPanels:', paths.length, 'panels, width=', w);
    const group = new THREE.Group();
    const s = w / EDITOR_W, hw = EDITOR_W / 2, hh = EDITOR_H / 2;
    const to2 = (pt: { x: number; y: number }) =>
      new THREE.Vector2((pt.x - hw) * s, (hh - pt.y) * s);

    for (const path of paths) {
      if (path.points.length < 2) continue;
      const isBack = path.points.some(p => p.x > 700);
      const shape  = new THREE.Shape().moveTo(...to2(path.points[0]).toArray());

      for (let i = 1; i < path.points.length; i++) {
        const prev = path.points[i - 1],
              cur  = path.points[i];
        const cp1 = { x: prev.x + (prev.handleOut?.dx || 0), y: prev.y + (prev.handleOut?.dy || 0) };
        const cp2 = { x: cur.x  + (cur.handleIn?.dx  || 0), y: cur.y  + (cur.handleIn?.dy  || 0) };
        const isCurve = cp1.x !== prev.x || cp1.y !== prev.y || cp2.x !== cur.x || cp2.y !== cur.y;

        if (isCurve) {
          shape.bezierCurveTo(
            ...to2(cp1).toArray(),
            ...to2(cp2).toArray(),
            ...to2(cur).toArray()
          );
        } else {
          shape.lineTo(...to2(cur).toArray());
        }
      }
      if (path.closed) shape.closePath();

      const geo  = new THREE.ExtrudeGeometry(shape, {
        depth:        0.01,
        bevelEnabled: false,
        curveSegments: 32,
        steps:         1,
      });
      const mat  = new THREE.MeshStandardMaterial({ color: 0xff4444, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);

      mesh.scale.set(isBack ? -2 : 2, 2, 2);
      const [px, py, pz] = isBack ? [7.1, 3.1, -0.75] : [3.1, 3.1, 0.75];
      mesh.position.set(px, py, pz);

      group.add(mesh);
    }

    console.log('[ThreeDView] buildPanels: added meshes=', group.children.length);
    return group;
  }

  // ─── Initialize Three.js ─────────────────────────────────
  useEffect(() => {
    console.log('[ThreeDView] initializing Three.js scene');
    const container = mountRef.current!;
    const scene     = new THREE.Scene();
    sceneRef.current = scene;

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
    controls.update();
    controls.addEventListener('change', () => {
      setCameraPos({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
      setCameraTarget({ x: controls.target.x,   y: controls.target.y,   z: controls.target.z   });
    });

    // lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5, 10, 7.5);
    scene.add(dl);

    // attach clothing & seams to scene root
    scene.add(clothing.current);
    scene.add(seamGroup.current);

    // load model + panels
    new GLTFLoader().load('/models/man.glb', gltf => {
      const model = gltf.scene;
      const box   = new THREE.Box3().setFromObject(model);
      const size  = box.getSize(new THREE.Vector3());
      setBbox({ width: size.x, height: size.y });

      // center model
      const center3 = box.getCenter(new THREE.Vector3());
      model.position.sub(center3);

      // build + add panels
      const panels = buildPanels(paths, size.x);
      clothing.current.add(panels);

      // parent panels and seams under the model (so they follow any model transforms)
      model.add(clothing.current);
      // **remove** any `model.add(seamGroup.current)` here!
      scene.add(model);

      console.log('[ThreeDView] model loaded, bbox=', size, 'panels=', panels.children.length);

      // optional animation mixer
      const mixer = new THREE.AnimationMixer(model);
      mixerRef.current = mixer;
      if (gltf.animations.length) {
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
        mixer.update(0);
      }
    });

    // render loop
    function animate() {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();

    window.addEventListener('resize', () => {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });

    return () => {
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []); // only on mount

  // ─── Build and place the seams ────────────────────────────
  useEffect(() => {
    console.log('[ThreeDView] seams effect:', {
      isSimulationMode,
      paths: present.paths.length,
      seams: present.seams.length
    });

    // clear old seam lines
    seamGroup.current.clear();
    if (!isSimulationMode) return;

    (async () => {
      try {
        // force‐update all world matrices
        sceneRef.current!.updateMatrixWorld(true);

        const engine = new PatternEngine();
        // split into front/back based on x>700
        const front = present.paths.find(p => p.points.some(pt => pt.x <= 700));
        const back  = present.paths.find(p => p.points.some(pt => pt.x  > 700));
        if (!front || !back) {
          console.warn('[Seams] missing front/back paths');
          return;
        }

        // prepare rust seams
        const rustSeams = present.seams.map(([a,b]) => {
          const isAfront = front.points.some(pt => pt.id === a[0]);
          const [from, to] = isAfront ? [a,b] : [b,a];
          return {
            from: {
              path_id: front.id,
              start:   front.points.findIndex(pt => pt.id === from[0]),
              end:     front.points.findIndex(pt => pt.id === from[1]),
            },
            to: {
              path_id: back.id,
              start:   back.points.findIndex(pt => pt.id === to[0]),
              end:     back.points.findIndex(pt => pt.id === to[1]),
            },
          };
        }).filter(s =>
          s.from.start >= 0 && s.from.end >= 0 &&
          s.to.start   >= 0 && s.to.end   >= 0
        );
        console.log('[Seams] rustSeams:', rustSeams);

        engine.load_json(JSON.stringify({ paths: present.paths, seams: rustSeams }));
        const resolved: {
          from_points: PointData[];
          to_points:   PointData[];
        }[] = engine.get_resolved_seams_json();
        console.log('[Seams] resolved:', resolved);

        // grab the two panel meshes
        const panelGroup = clothing.current.children[0] as THREE.Group;
        const meshes     = panelGroup.children.filter(c => c instanceof THREE.Mesh) as THREE.Mesh[];
        console.log('[Seams] panel meshes count=', meshes.length);

        // draw each seam as two blue lines (start / end)
        rustSeams.forEach((rs, i) => {
          const r = resolved[i];
          if (!r) return;

          // pick the correct mesh by matching path_id
          const meshA = meshes[ front.id === rs.from.path_id ? 0 : 1 ];
          const meshB = meshes[ back.id  === rs.to  .path_id ? 1 : 0 ];

          // START point
          const A0 = toWorld(r.from_points[0].x, r.from_points[0].y).clone();
          const B0 = toWorld(r.to_points  [0].x, r.to_points  [0].y).clone();

          meshA.localToWorld(A0);
          meshB.localToWorld(B0);
          console.log(`[Seams][${i}] A0,B0`, A0.toArray(), B0.toArray());

          seamGroup.current.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([A0, B0]),
            new THREE.LineBasicMaterial({ color: 0x0000ff })
          ));

          // END point
          const A1 = toWorld(
            r.from_points[r.from_points.length - 1].x,
            r.from_points[r.from_points.length - 1].y
          ).clone();
          const B1 = toWorld(
            r.to_points  [r.to_points  .length - 1].x,
            r.to_points  [r.to_points  .length - 1].y
          ).clone();

          meshA.localToWorld(A1);
          meshB.localToWorld(B1);
          console.log(`[Seams][${i}] A1,B1`, A1.toArray(), B1.toArray());

          seamGroup.current.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([A1, B1]),
            new THREE.LineBasicMaterial({ color: 0x0000ff })
          ));
        });
      } catch (err) {
        console.error('[Seams] error:', err);
      }
    })();
  }, [isSimulationMode, present.paths, present.seams, bbox]);

  return (
    <div className="h-full w-full relative">
      <button
        onClick={() => setIsSimulationMode(!isSimulationMode)}
        className="absolute top-2 left-2 z-[2000] p-1 border-2 rounded-xl border-blue-500 text-white flex items-center gap-1"
        style={{ backgroundColor: isSimulationMode ? '#193cb8' : 'transparent' }}
      >
        <img
          src={isSimulationMode ? '/svg/play.svg' : '/svg/pause.svg'}
          className="h-6 w-6"
        />
        {isSimulationMode ? 'Simulation' : 'Modeling'}
      </button>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
