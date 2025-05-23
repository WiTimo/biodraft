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
  const { isSimulationMode, setIsSimulationMode, present } = useCanvasState();
  const { cameraPos, cameraTarget, setCameraPos, setCameraTarget } = useCanvasState();
  const paths = useCanvasState(s => s.present.paths);

  // editor→local‐plane
  function toWorld(x: number, y: number) {
    const s = bbox.width / EDITOR_W;
    const hw = EDITOR_W/2, hh = EDITOR_H/2;
    return new THREE.Vector3((x - hw)*s, (hh - y)*s, 0);
  }

  // build panels (same as before) …
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
        const cp1 = { x:prev.x + (prev.handleOut?.dx||0), y:prev.y + (prev.handleOut?.dy||0) };
        const cp2 = { x:cur.x  + (cur.handleIn?.dx||0),  y:cur.y  + (cur.handleIn?.dy||0) };
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

      const geo  = new THREE.ExtrudeGeometry(shape,{depth:0.01,bevelEnabled:false,curveSegments:32,steps:1});
      const mat  = new THREE.MeshStandardMaterial({color:0xff4444,side:THREE.DoubleSide});
      const mesh = new THREE.Mesh(geo, mat);

      mesh.scale.set(isBack?-2:2,2,2);
      const [px,py,pz] = isBack?[7.1,3.1,-0.75]:[3.1,3.1,0.75];
      mesh.position.set(px,py,pz);

      group.add(mesh);
    }
    return group;
  }

  // ─── init Three.js scene ──────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current!;
    const scene     = new THREE.Scene();
    const camera    = new THREE.PerspectiveCamera(60, container.clientWidth/container.clientHeight, 0.1, 1000);
    camera.position.set(cameraPos.x,cameraPos.y,cameraPos.z);

    const renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setSize(container.clientWidth,container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera,renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.1;
    controls.target.set(cameraTarget.x,cameraTarget.y,cameraTarget.z);
    controls.update();
    controls.addEventListener('change',()=>{
      setCameraPos({x:camera.position.x,y:camera.position.y,z:camera.position.z});
      setCameraTarget({x:controls.target.x,y:controls.target.y,z:controls.target.z});
    });

    scene.add(new THREE.HemisphereLight(0xffffff,0x444444,0.7));
    const dl = new THREE.DirectionalLight(0xffffff,0.8);
    dl.position.set(5,10,7.5);
    scene.add(dl);

    scene.add(clothing.current);
    scene.add(seamGroup.current);

    new GLTFLoader().load('/models/man.glb', gltf => {
      const model = gltf.scene;
      const box   = new THREE.Box3().setFromObject(model);
      const size  = box.getSize(new THREE.Vector3());
      setBbox({width:size.x, height:size.y});

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
      camera.aspect = w/h; camera.updateProjectionMatrix();
    });

    return () => {
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

useEffect(() => {
  if (!isSimulationMode) {
    console.log("[Seams] Simulation mode off — clearing seams.");
    seamGroup.current.children.forEach((line: THREE.Line) => {
      line.geometry.dispose();
      if (Array.isArray(line.material)) {
        line.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        line.material.dispose();
      }
    });
    seamGroup.current.clear();
    return;
  }

  (async () => {
    try {
      console.log("[Seams] Simulation mode on — building seams.");
      const engine = new PatternEngine();

      const [fp, bp] = present.paths;
      if (!fp || !bp) {
        console.warn("[Seams] Missing front or back path in present.paths", present.paths);
        return;
      }

      console.log(`[Seams] Front path ID: ${fp.id}, points: ${fp.points.length}`);
      console.log(`[Seams] Back path ID: ${bp.id}, points: ${bp.points.length}`);
      console.log(`[Seams] Present seams count: ${present.seams.length}`);

      const rustSeams = (present.seams as [string,string][][]).map(([[fs,fe],[ts,te]], i) => {
        const fromStart = fp.points.findIndex(p => p.id === fs);
        const fromEnd   = fp.points.findIndex(p => p.id === fe);
        const toStart   = bp.points.findIndex(p => p.id === ts);
        const toEnd     = bp.points.findIndex(p => p.id === te);

        console.log(`[Seams][${i}] Seam points IDs: from [${fs},${fe}] to [${ts},${te}]`);
        console.log(`[Seams][${i}] Mapped indices: from [${fromStart},${fromEnd}] to [${toStart},${toEnd}]`);

        return {
          from: { path_id: fp.id, start: fromStart, end: fromEnd },
          to:   { path_id: bp.id, start: toStart, end: toEnd },
        };
      }).filter((s, i) => {
        const valid = s.from.start >= 0 && s.from.end >= 0 && s.to.start >= 0 && s.to.end >= 0;
        if (!valid) {
          console.warn(`[Seams] Filtering out invalid seam at index ${i}:`, s);
        }
        return valid;
      });

      console.log(`[Seams] Rust seams after filtering: ${rustSeams.length}`);

      engine.load_json(JSON.stringify({
        paths: present.paths,
        seams: rustSeams,
      }));

      const wasmJson = engine.get_json();
      console.log("[Seams] WASM engine JSON data:", wasmJson);

      const resolved: { from_points: PointData[], to_points: PointData[] }[] = engine.get_resolved_seams_json();
      console.log("[Seams] Resolved seams from WASM:", resolved);

      const meshes = clothing.current.children as THREE.Mesh[];
      console.log(`[Seams] Number of panel meshes: ${meshes.length}`);

      // Clear old seams, disposing their geometry/materials
      seamGroup.current.children.forEach((line: THREE.Line) => {
        line.geometry.dispose();
        if (Array.isArray(line.material)) {
          line.material.forEach((m: THREE.Material) => m.dispose());
        } else {
          line.material.dispose();
        }
      });
      seamGroup.current.clear();

      resolved.forEach((s, i) => {
        const fromDef = rustSeams[i].from;
        const toDef   = rustSeams[i].to;
        const meshA   = fromDef.path_id === fp.id ? meshes[0] : meshes[1];
        const meshB   = toDef.path_id === fp.id ? meshes[0] : meshes[1];

        const fPts = s.from_points;
        const tPts = s.to_points;

        if (fPts.length < 1 || tPts.length < 1) {
          console.warn(`[Seams][${i}] Empty from_points or to_points; skipping seam.`);
          return;
        }

        // Start points
        const A_start = toWorld(fPts[0].x, fPts[0].y);
        const B_start = toWorld(tPts[0].x, tPts[0].y);
        meshA.localToWorld(A_start);
        meshB.localToWorld(B_start);

        console.log(`[Seams][${i}] Start points after toWorld and localToWorld: A=${A_start.toArray()}, B=${B_start.toArray()}`);

        const geoStart = new THREE.BufferGeometry().setFromPoints([A_start, B_start]);
        const matStart = new THREE.LineBasicMaterial({ color: 0x00ffff });
        const lineStart = new THREE.Line(geoStart, matStart);
        seamGroup.current.add(lineStart);

        // End points
        const A_end = toWorld(fPts[fPts.length - 1].x, fPts[fPts.length - 1].y);
        const B_end = toWorld(tPts[tPts.length - 1].x, tPts[tPts.length - 1].y);
        meshA.localToWorld(A_end);
        meshB.localToWorld(B_end);

        console.log(`[Seams][${i}] End points after toWorld and localToWorld: A=${A_end.toArray()}, B=${B_end.toArray()}`);

        const geoEnd = new THREE.BufferGeometry().setFromPoints([A_end, B_end]);
        const matEnd = new THREE.LineBasicMaterial({ color: 0x00ffff });
        const lineEnd = new THREE.Line(geoEnd, matEnd);
        seamGroup.current.add(lineEnd);
      });

      console.log(`[Seams] Added ${resolved.length * 2} seam lines to seamGroup.`);

    } catch (err) {
      console.error("[Seams] Error while computing seams:", err);
      alert(`Seam computation error: ${err.message || err}`);
    }
  })();
}, [isSimulationMode, present]);

  return (
    <div className="h-full w-full relative">
      <button
        className="absolute top-2 left-2 z-[2000] text-white rounded-xl border-blue-500 border-2 p-1 pl-4 pr-4 flex items-center gap-1"
        onClick={() => setIsSimulationMode(!isSimulationMode)}
        style={{ backgroundColor: isSimulationMode ? "#193cb8" : "#00000000" }}
      >
        <img src={isSimulationMode ? "/svg/play.svg" : "/svg/pause.svg"} className='h-6 w-6' />
        {isSimulationMode ? "Simulation" : "Modeling"}
      </button>
      <div ref={mountRef} style={{ width:'100%', height:'100%' }}/>
    </div>
  );
}
