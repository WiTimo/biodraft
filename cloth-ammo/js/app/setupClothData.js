// js/app/setupClothData.js

import * as THREE from 'three';
import Delaunator        from 'delaunator';
import { pointInPolygon } from '../utils.js';
import {
  sphereRadius,
  initialClothHeight,
  boundarySegments,
  separationY
} from './config.js';

export function setupClothData(patternData) {
  const ids0 = new Set(patternData.patterns[0].points.map(p => p.id));

  // [1] sample & triangulate halves
  const halves = patternData.patterns.map(pat => {
    let minX = Infinity, maxX = -Infinity,
        minY = Infinity, maxY = -Infinity;
    pat.points.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
    const cx = (minX + maxX) / 2,
          cy = (minY + maxY) / 2;
    const scl = 1 / Math.max(maxX - minX, maxY - minY);
    const norm = p => ({ x: (p.x - cx) * scl, y: (p.y - cy) * scl });

    const shape = new THREE.Shape();
    const P0 = norm(pat.points[0]);
    shape.moveTo(P0.x, P0.y);
    for (let i = 1; i < pat.points.length; i++) {
      const A = pat.points[i - 1], B = pat.points[i];
      const nA = norm(A), nB = norm(B);
      const hasBez = (A.handleOut.dx || A.handleOut.dy)
                  || (B.handleIn.dx  || B.handleIn.dy);
      if (hasBez) {
        const cp1 = norm({
          x: A.x + (A.handleOut.dx || 0),
          y: A.y + (A.handleOut.dy || 0)
        });
        const cp2 = norm({
          x: B.x + (B.handleIn.dx  || 0),
          y: B.y + (B.handleIn.dy  || 0)
        });
        shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, nB.x, nB.y);
      } else {
        shape.lineTo(nB.x, nB.y);
      }
    }
    shape.lineTo(P0.x, P0.y);

    const boundary = shape.getSpacedPoints(boundarySegments);

    let bbMinX = Infinity, bbMaxX = -Infinity,
        bbMinY = Infinity, bbMaxY = -Infinity;
    boundary.forEach(v => {
      bbMinX = Math.min(bbMinX, v.x);
      bbMaxX = Math.max(bbMaxX, v.x);
      bbMinY = Math.min(bbMinY, v.y);
      bbMaxY = Math.max(bbMaxY, v.y);
    });

    // interior sampling
    const interior = [];
    const step = (bbMaxX - bbMinX) / 50;
    for (let x = bbMinX; x <= bbMaxX; x += step) {
      for (let y = bbMinY; y <= bbMaxY; y += step) {
        if (pointInPolygon(x, y, boundary)) {
          interior.push({ x, y });
        }
      }
    }

    // Delaunay triangulation & centroid filter
    const pts2D = boundary.concat(interior);
    const coords = pts2D.map(p => [p.x, p.y]);
    const dela   = Delaunator.from(coords);
    const idx    = [];
    for (let i = 0; i < dela.triangles.length; i += 3) {
      const a = dela.triangles[i],
            b = dela.triangles[i+1],
            c = dela.triangles[i+2];
      const pa = pts2D[a], pb = pts2D[b], pc = pts2D[c];
      const mx = (pa.x + pb.x + pc.x) / 3,
            my = (pa.y + pb.y + pc.y) / 3;
      if (pointInPolygon(mx, my, boundary)) {
        idx.push(a, b, c);
      }
    }

    return { norm, boundary, pts2D, idx, original: pat.points };
  });

  // [2] merge the two halves
  const Apts    = halves[0].pts2D;
  const Bpts    = halves[1].pts2D;
  const allPts  = Apts.concat(Bpts);
  const idxA    = halves[0].idx;
  const idxB    = halves[1].idx.map(i => i + Apts.length);
  const globalIdx = idxA.concat(idxB);

  const quatX = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/2);
  const quatY = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI);

  const verletVertices = allPts.map((p,i) => {
    const offsetY = initialClothHeight
                  + (i < Apts.length ? -separationY : +separationY);
    const pos = new THREE.Vector3(p.x, offsetY, p.y);
    if (i >= Apts.length) pos.applyQuaternion(quatY);
    pos.applyQuaternion(quatX);
    return { id: i, position: pos, isFixed: 0, springIds: [] };
  });

  // structural springs
  const verletSprings   = [];
  const seamDebugPairs  = [];
  function addSpring(i0,i1) {
    const v0 = verletVertices[i0], v1 = verletVertices[i1];
    for (const sid of v0.springIds) {
      const s = verletSprings[sid];
      if ((s.v0===i0 && s.v1===i1) || (s.v0===i1 && s.v1===i0)) return;
    }
    const sid = verletSprings.length;
    verletSprings.push({ v0:i0, v1:i1 });
    v0.springIds.push(sid);
    v1.springIds.push(sid);
  }
  for (let i=0; i<globalIdx.length; i+=3) {
    addSpring(globalIdx[i],   globalIdx[i+1]);
    addSpring(globalIdx[i+1], globalIdx[i+2]);
    addSpring(globalIdx[i+2], globalIdx[i]);
  }

  // seam (stitch) springs
  for (const seam of patternData.seams) {
    const [aPair,bPair] = seam;
    const half0 = ids0.has(aPair[0]) ? aPair : bPair;
    const half1 = ids0.has(aPair[0]) ? bPair : aPair;

    const getBoundaryIndex = (pid, half) => {
      const po = half.original.find(p=>p.id===pid);
      const np = half.norm(po);
      let best=0, d2=Infinity;
      half.boundary.forEach((v,i)=>{
        const dd = (v.x-np.x)**2 + (v.y-np.y)**2;
        if (dd<d2){ d2=dd; best=i; }
      });
      return best;
    };

    const getBoundarySequence = (start,end,N) => {
      const seqF=[], seqB=[];
      let cur = start;
      do { seqF.push(cur); cur=(cur+1)%N; }
      while (cur !== ((end+1)%N));
      cur = start;
      do { seqB.push(cur); cur=(cur-1+N)%N; }
      while (cur !== ((end-1+N)%N));
      return seqF.length <= seqB.length ? seqF : seqB;
    };

    const i0 = getBoundaryIndex(half0[0], halves[0]);
    const i1 = getBoundaryIndex(half0[1], halves[0]);
    const j0 = getBoundaryIndex(half1[0], halves[1]);
    const j1 = getBoundaryIndex(half1[1], halves[1]);

    let seq0 = getBoundarySequence(i0,i1, halves[0].boundary.length);
    let seq1 = getBoundarySequence(j0,j1, halves[1].boundary.length);
    const L = Math.max(seq0.length, seq1.length);
    const resample = (seq,T) =>
      Array.from({length:T},(_,k)=>seq[Math.floor(k*seq.length/T)]);
    if (seq0.length !== L) seq0 = resample(seq0, L);
    if (seq1.length !== L) seq1 = resample(seq1, L);

    for (let k=0; k<L; k++) {
      const idx0 = seq0[k];
      const idx1 = seq1[k] + Apts.length;
      addSpring(idx0, idx1);
      seamDebugPairs.push([idx0, idx1]);
    }
  }

  console.log('ℹ️ total seam springs:', seamDebugPairs.length);

  return { verletVertices, verletSprings, seamDebugPairs, globalIdx };
}
