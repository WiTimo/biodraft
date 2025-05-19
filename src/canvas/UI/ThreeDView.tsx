// src/components/ThreeDView.tsx

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { PatternEngine } from '../wasm/cloth_engine';
import { useCanvasState } from '../state/CanvasState';

const EDITOR_W = 800;
const EDITOR_H = 600;

interface Handle   { dx: number; dy: number }
interface PointData { id: string; x: number; y: number; handleIn?: Handle; handleOut?: Handle }
interface PathData  { id: string; points: PointData[]; closed: boolean }

export function ThreeDView() {
  const mountRef   = useRef<HTMLDivElement>(null);
  const clothing   = useRef(new THREE.Group());
  const seamGroup  = useRef(new THREE.Group());
  const mixerRef   = useRef<THREE.AnimationMixer>();

  const [bbox, setBbox]                 = useState({ width: 0, height: 0 });
  const [simPaths, setSimPaths]         = useState<PathData[]|null>(null);
  const { isSimulationMode, setIsSimulationMode, present } = useCanvasState();
  const { cameraPos, cameraTarget, setCameraPos, setCameraTarget } = useCanvasState();
  const paths = useCanvasState(s => s.present.paths);

  // editor→local plane coords
  function toWorld(x: number, y: number) {
    const pxToW = bbox.width / EDITOR_W;
    const hw = EDITOR_W/2, hh = EDITOR_H/2;
    return new THREE.Vector3((x-hw)*pxToW, (hh-y)*pxToW, 0);
  }

  // build the two red panels
  function buildPanels(paths: PathData[], w: number) {
    const group = new THREE.Group();
    const s = w/EDITOR_W, hw = EDITOR_W/2, hh = EDITOR_H/2;
    const to2 = (pt:{x:number,y:number}) => new THREE.Vector2((pt.x-hw)*s,(hh-pt.y)*s);

    for (const path of paths) {
      if (path.points.length < 2) continue;
      const isBack = path.points.some(p => p.x > 700);
      const shape  = new THREE.Shape().moveTo(...to2(path.points[0]).toArray());
      for (let i=1; i<path.points.length; i++) {
        const prev = path.points[i-1], cur = path.points[i];
        const cp1 = { x:prev.x+(prev.handleOut?.dx||0), y:prev.y+(prev.handleOut?.dy||0) };
        const cp2 = { x:cur.x +(cur.handleIn?.dx||0),  y:cur.y +(cur.handleIn?.dy||0)  };
        const isCurve = cp1.x!==prev.x||cp1.y!==prev.y||cp2.x!==cur.x||cp2.y!==cur.y;
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

      const geo  = new THREE.ExtrudeGeometry(shape, { depth:0.01, bevelEnabled:false, curveSegments:32, steps:1 });
      const mat  = new THREE.MeshStandardMaterial({ color:0xff4444, side:THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);

      mesh.scale.set(isBack ? -2 : 2, 2, 2);
      const [px,py,pz] = isBack ? [7.1,3.0,-0.75] : [3.1,3.0,0.75];
      mesh.position.set(px,py,pz);

      group.add(mesh);
    }

    return group;
  }

  // ─── init scene ─────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current!;
    const scene     = new THREE.Scene();
    const camera    = new THREE.PerspectiveCamera(
      60, container.clientWidth/container.clientHeight, 0.1, 1000
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
      setCameraPos({ x:camera.position.x, y:camera.position.y, z:camera.position.z });
      setCameraTarget({ x:controls.target.x, y:controls.target.y, z:controls.target.z });
    });

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5,10,7.5);
    scene.add(dl);

    scene.add(clothing.current);
    scene.add(seamGroup.current);

    new GLTFLoader().load('/models/man.glb', gltf => {
      const model = gltf.scene;
      const box   = new THREE.Box3().setFromObject(model);
      const size  = box.getSize(new THREE.Vector3());
      setBbox({ width:size.x, height:size.y });

      const c = box.getCenter(new THREE.Vector3());
      model.position.sub(c);

      model.add(clothing.current);
      scene.add(model);

      const mixer = new THREE.AnimationMixer(model);
      mixerRef.current = mixer;
      if (gltf.animations.length) {
        const action = mixer.clipAction(gltf.animations[0]);
        action.play(); mixer.update(0);
      }
    });

    function animate() {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();

    window.addEventListener('resize', () => {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w,h);
      camera.aspect = w/h;
      camera.updateProjectionMatrix();
    });

    return () => {
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // ─── rebuild panels on paths/bbox change ───────────────────
  useEffect(() => {
    if (!bbox.width) return;
    const grp = clothing.current;
    grp.children.forEach((m:any) => {
      m.geometry.dispose();
      Array.isArray(m.material)
        ? m.material.forEach((mt:any) => mt.dispose())
        : m.material.dispose();
    });
    grp.clear();

    grp.add(...buildPanels(paths, bbox.width).children);
  }, [paths, bbox]);

  // ─── simulation: run WASM & draw exactly one world‐space line ─────────────
  useEffect(() => {
    if (!isSimulationMode) {
      setSimPaths(null);
      seamGroup.current.clear();
      return;
    }

    (async () => {
      const engine = new PatternEngine();

      const [fp,bp] = present.paths;
      const rustSeams = (present.seams as [string,string][][]).map(
        ([[fs,fe],[ts,te]]) => ({
          from:{
            path_id: fp.id,
            start:   fp.points.findIndex(p=>p.id===fs),
            end:     fp.points.findIndex(p=>p.id===fe),
          },
          to:{
            path_id: bp.id,
            start:   bp.points.findIndex(p=>p.id===ts),
            end:     bp.points.findIndex(p=>p.id===te),
          },
        })
      );

      engine.load_json(JSON.stringify({ paths:present.paths, seams:rustSeams }));
      const { paths:wp } = engine.get_json();
      setSimPaths(wp);

      const resolved = engine.get_resolved_seams_json() as { from_points:PointData[], to_points:PointData[] }[];
      // after you have your `resolved` array and your two meshes:
const meshes = clothing.current.children as THREE.Mesh[];

// clear old seams
seamGroup.current.clear();
resolved.forEach((s, i) => {
  const { from: fromDef, to: toDef } = rustSeams[i];
  const meshes = clothing.current.children as THREE.Mesh[];

  // pick the correct mesh for front/back by path_id
  const meshA = fromDef.path_id === fp.id ? meshes[0] : meshes[1];
  const meshB =   toDef.path_id === fp.id ? meshes[0] : meshes[1];

  // now draw **every** corresponding pair
  const n = Math.min(s.from_points.length, s.to_points.length);
  for (let j = 0; j < n; j++) {
    const A_pt = s.from_points[j];
    const B_pt = s.to_points[j];

    // editor → panel-local plane
    const A = toWorld(A_pt.x, A_pt.y);
    const B = toWorld(B_pt.x, B_pt.y);

    // each point into its own mesh’s world-space
    meshA.localToWorld(A);
    meshB.localToWorld(B);

    // render that segment
    const geo = new THREE.BufferGeometry().setFromPoints([A, B]);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    seamGroup.current.add(new THREE.Line(geo, mat));
  }
});
    })().catch(console.error);
  }, [isSimulationMode, present]);

  return (
    <div className="h-full w-full relative">
      <button
        className="absolute top-0 left-0 z-[2000] text-white"
        onClick={() => setIsSimulationMode(!isSimulationMode)}
      >
        {isSimulationMode ? "Simulation" : "Modeling"}
      </button>
      <div ref={mountRef} style={{ width:'100%', height:'100%' }}/>
    </div>
  );
}
