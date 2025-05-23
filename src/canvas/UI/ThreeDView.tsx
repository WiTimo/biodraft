// src/components/ThreeDView.tsx

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader }   from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls }from 'three/examples/jsm/controls/OrbitControls';
import { PatternEngine }from '../wasm/cloth_engine';
import { useCanvasState } from '../state/CanvasState';

const EDITOR_W = 800;
const EDITOR_H = 600;

interface Handle   { dx: number; dy: number }
interface PointData { id: string; x: number; y: number; handleIn?: Handle; handleOut?: Handle }
interface PathData  { id: string; points: PointData[]; closed: boolean }

export function ThreeDView() {
  const mountRef  = useRef<HTMLDivElement>(null);
  const sceneRef  = useRef<THREE.Scene>();
  const clothing  = useRef(new THREE.Group());
  const seamGroup = useRef(new THREE.Group());
  const engineRef = useRef<PatternEngine>(new PatternEngine());
  const mixerRef  = useRef<THREE.AnimationMixer>();         

  const [bbox, setBbox] = useState({ width: 0, height: 0 });
  const { isSimulationMode, setIsSimulationMode, present } = useCanvasState();
  const { cameraPos, cameraTarget, setCameraPos, setCameraTarget } = useCanvasState();
  const paths = useCanvasState(s => s.present.paths);

  // Map editor (x,y) → local plane Vector3
  function toWorld(x: number, y: number) {
    const s  = bbox.width / EDITOR_W;
    const hw = EDITOR_W/2, hh = EDITOR_H/2;
    return new THREE.Vector3((x - hw)*s, (hh - y)*s, 0);
  }

  // Build the red panels once with curves, and tag each mesh with its path.id
  function buildPanels(paths: PathData[], w: number) {
    console.log('[ThreeDView] buildPanels:', paths.length, 'panels, width=', w);
    const group = new THREE.Group();

    for (const path of paths) {
      if (path.points.length < 2) continue;
      const isBack = path.points.some(p => p.x > 700);

      // start shape
      const shape = new THREE.Shape();
      // first point:
      {
        const p0 = path.points[0];
        const v0 = toWorld(p0.x, p0.y);
        shape.moveTo(v0.x, v0.y);
      }

      // draw each segment with Bezier
      for (let i = 1; i < path.points.length; i++) {
        const prev = path.points[i - 1];
        const cur  = path.points[i];
        const pv   = toWorld(prev.x, prev.y);
        const nv   = toWorld(cur.x,  cur.y);

        // control points
        const cp1 = toWorld(prev.x + (prev.handleOut?.dx||0), prev.y + (prev.handleOut?.dy||0));
        const cp2 = toWorld(cur .x + (cur .handleIn?.dx||0), cur .y + (cur .handleIn?.dy||0));

        shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, nv.x, nv.y);
      }

      // closing
      if (path.closed) {
        const last = path.points[path.points.length - 1];
        const first= path.points[0];
        const lv   = toWorld(last.x, last.y);
        const fv   = toWorld(first.x, first.y);
        const cp1  = toWorld(last.x + (last.handleOut?.dx||0), last.y + (last.handleOut?.dy||0));
        const cp2  = toWorld(first.x+ (first.handleIn?.dx||0), first.y+ (first.handleIn?.dy||0));
        shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, fv.x, fv.y);
        shape.closePath();
      }

      // extrude
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth:         0.01,
        bevelEnabled:  false,
        curveSegments: 32,
        steps:         1,
      });
      const mat  = new THREE.MeshStandardMaterial({ color: 0xff4444, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);

      // tag for later
      mesh.userData.pathId = path.id;

      // scale & position
      mesh.scale.set(isBack ? -2 : 2, 2, 2);
      const [px,py,pz] = isBack ? [7.1,3.1,-0.75] : [3.1,3.1,0.75];
      mesh.position.set(px, py, pz);

      group.add(mesh);
    }

    console.log('[ThreeDView] buildPanels: added meshes=', group.children.length);
    return group;
  }

  // ─── Initialize Three.js scene ────────────────────────────
  useEffect(() => {
    console.log('[ThreeDView] initializing Three.js');
    const container = mountRef.current!;
    const scene     = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
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
      setCameraPos({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
      setCameraTarget({ x: controls.target.x, y: controls.target.y, z: controls.target.z });
    });

    // lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5,10,7.5);
    scene.add(dl);

    // add root groups
    scene.add(clothing.current);
    scene.add(seamGroup.current);

    // load model + panels
    new GLTFLoader().load('/models/man.glb', gltf => {
      const model = gltf.scene;
      const box   = new THREE.Box3().setFromObject(model);
      const size  = box.getSize(new THREE.Vector3());
      setBbox({ width: size.x, height: size.y });

      // center
      const c3 = box.getCenter(new THREE.Vector3());
      model.position.sub(c3);

      // panels
      const panels = buildPanels(paths, size.x);
      clothing.current.add(panels);
      model.add(clothing.current);
      scene.add(model);

      console.log('[ThreeDView] model loaded, bbox=', size);

      // optional animation
      const mixer = new THREE.AnimationMixer(model);
      mixerRef.current = mixer;
      if (gltf.animations.length) {
        const action = mixer.clipAction(gltf.animations[0]);
        action.play(); mixer.update(0);
      }
    });

    // render loop
    function animate() {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();

    // handle resize
    window.addEventListener('resize', () => {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w/h; camera.updateProjectionMatrix();
    });

    return () => {
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // ─── Physics + panel‐rebuild + seam‐draw loop ─────────────
  useEffect(() => {
    if (!isSimulationMode) {
      seamGroup.current.clear();
      return;
    }
    const engine = engineRef.current!;
    let last = performance.now();
    let raf: number;

    // build Rust payload
    const front = present.paths.find(p => p.points.some(pt => pt.x <= 700));
    const back  = present.paths.find(p => p.points.some(pt => pt.x  > 700));
    if (!front || !back) {
      console.warn('[Physics] missing front/back');
      return;
    }

    const rustSeams = present.seams.map(([A,B]) => {
      const isAfront = front.points.some(pt=>pt.id===A[0]);
      const [from,to] = isAfront ? [A,B] : [B,A];
      const fs = front.points.findIndex(pt=>pt.id===from[0]);
      const fe = front.points.findIndex(pt=>pt.id===from[1]);
      const ts = back .points.findIndex(pt=>pt.id===to  [0]);
      const te = back .points.findIndex(pt=>pt.id===to  [1]);
      return { from:{path_id:front.id,start:fs,end:fe}, to:{path_id:back.id,start:ts,end:te} };
    }).filter(s => s.from.start>=0 && s.from.end>=0 && s.to.start>=0 && s.to.end>=0);

    const payload = {
      paths: present.paths.map(p => ({
        id: p.id, closed: p.closed,
        points: p.points.map(pt => ({
          id: pt.id, x:pt.x, y:pt.y,
          handleIn:  pt.handleIn  ? { dx:pt.handleIn.dx,  dy:pt.handleIn.dy  } : undefined,
          handleOut: pt.handleOut ? { dx:pt.handleOut.dx, dy:pt.handleOut.dy } : undefined,
        }))
      })),
      seams: rustSeams,
    };

    try {
      engine.load_json(JSON.stringify(payload));
      engine.init_physics();
    } catch (e) {
      console.error('[Physics] init failed', e);
      return;
    }

    function tick(now: number) {
      try {
        const dt = (now - last)/1000; last = now;
        engine.step_physics(dt);
        const updated: PointData[] = engine.get_physics_positions();
        console.log('[Physics] pts=', updated.length);

        // rebuild panels
        const posMap = new Map(updated.map(p=>[p.id,p]));
        const panelGroup = clothing.current.children[0] as THREE.Group;
        panelGroup.children.forEach((child, idx) => {
          const mesh = child as THREE.Mesh;
          const pid  = mesh.userData.pathId as string;
          const path = present.paths.find(p=>p.id===pid);
          if (!path) return;

          const shape = new THREE.Shape();
          // first point
          {
            const phys = posMap.get(path.points[0].id)!;
            const v0   = toWorld(phys.x, phys.y);
            shape.moveTo(v0.x, v0.y);
          }
          // segments
          for (let i=1; i<path.points.length; i++) {
            const pt   = path.points[i];
            const prev = path.points[i-1];
            const cphys= posMap.get(prev.id)!;
            const nphys= posMap.get(pt.id)!;
            const pWorld = toWorld(cphys.x, cphys.y);
            const nWorld = toWorld(nphys.x, nphys.y);
            const cp1    = toWorld(cphys.x + (prev.handleOut?.dx||0), cphys.y + (prev.handleOut?.dy||0));
            const cp2    = toWorld(nphys.x +   (pt.handleIn?.dx||0), nphys.y +   (pt.handleIn?.dy||0));
            shape.bezierCurveTo(cp1.x,cp1.y,cp2.x,cp2.y,nWorld.x,nWorld.y);
          }
          // closing
          if (path.closed && path.points.length>=2) {
            const first=path.points[0], lastP=path.points[path.points.length-1];
            const fph  = posMap.get(first.id)!, lph=posMap.get(lastP.id)!;
            const fWorld=toWorld(fph.x,fph.y), lWorld=toWorld(lph.x,lph.y);
            const cp1  = toWorld(lph.x+(lastP.handleOut?.dx||0),lph.y+(lastP.handleOut?.dy||0));
            const cp2  = toWorld(fph.x+(first.handleIn?.dx||0),fph.y+(first.handleIn?.dy||0));
            shape.bezierCurveTo(cp1.x,cp1.y,cp2.x,cp2.y,fWorld.x,fWorld.y);
            shape.closePath();
          }
          // swap geometry
          const newGeo = new THREE.ExtrudeGeometry(shape,{
            depth:0.01, bevelEnabled:false, curveSegments:32, steps:1
          });
          mesh.geometry.dispose();
          mesh.geometry = newGeo;
        });

        // draw springs
        seamGroup.current.clear();
        present.seams.forEach(([A,B],i)=>{
          [0,1].forEach(k=>{
            const a=posMap.get(A[k]), b=posMap.get(B[k]);
            if(!a||!b) return;
            const A3=toWorld(a.x,a.y).clone(), B3=toWorld(b.x,b.y).clone();
            seamGroup.current.add(new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([A3,B3]),
              new THREE.LineBasicMaterial({ color:0x0000ff })
            ));
          });
        });

      } catch(err) {
        console.error('[Physics] tick error', err);
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);

  }, [ isSimulationMode, present.paths, present.seams, bbox ]);


  return (
    <div className="h-full w-full relative">
      <button
        onClick={() => setIsSimulationMode(!isSimulationMode)}
        className="absolute top-2 left-2 z-[2000] p-2 border-2 rounded-xl border-blue-500 text-white flex items-center gap-1"
        style={{ backgroundColor: isSimulationMode ? '#193cb8' : 'transparent' }}
      >
        <img src={isSimulationMode ? '/svg/play.svg' : '/svg/pause.svg'} className="h-6 w-6"/>
        {isSimulationMode ? 'Simulation' : 'Modeling'}
      </button>
      <div ref={mountRef} style={{ width:'100%', height:'100%' }}/>
    </div>
  );
}
