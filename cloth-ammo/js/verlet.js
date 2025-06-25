import * as THREE from 'three';
import Delaunator from 'delaunator';
import { pointInAnyPolygon } from './utils.js';
import { normalizePoint, patternData } from './config.js';

export let verletVertices    = [];
export let initialPositions  = [];
export let springs           = [];

export function setupVerletFromPattern(pat, boundarySegments, initialClothHeight) {
  const pts = pat.points;
  if (!pts || pts.length < 3) return null;

  const shape = new THREE.Shape();
  const p0 = normalizePoint(pts[0]);
  shape.moveTo(p0.x, p0.y);
  for (let i = 1; i < pts.length; i++) {
    const A = pts[i - 1], B = pts[i];
    const nA = normalizePoint(A), nB = normalizePoint(B);
    const hasBez = (A.handleOut?.dx || A.handleOut?.dy) ||
                   (B.handleIn?.dx  || B.handleIn?.dy);
    if (hasBez) {
      const cp1 = normalizePoint({
        x: A.x + (A.handleOut?.dx || 0),
        y: A.y + (A.handleOut?.dy || 0)
      });
      const cp2 = normalizePoint({
        x: B.x + (B.handleIn?.dx  || 0),
        y: B.y + (B.handleIn?.dy  || 0)
      });
      shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, nB.x, nB.y);
    } else {
      shape.lineTo(nB.x, nB.y);
    }
  }
  shape.lineTo(p0.x, p0.y);
  const boundary = shape.getSpacedPoints(boundarySegments);
  if (boundary.length < 3) return null;

  let bbMinX = Infinity, bbMaxX = -Infinity,
      bbMinY = Infinity, bbMaxY = -Infinity;
  for (let v of boundary) {
    bbMinX = Math.min(bbMinX, v.x);
    bbMaxX = Math.max(bbMaxX, v.x);
    bbMinY = Math.min(bbMinY, v.y);
    bbMaxY = Math.max(bbMaxY, v.y);
  }

  const interior = [];
  const step = (bbMaxX - bbMinX) / 50;
  for (let x = bbMinX; x <= bbMaxX; x += step) {
    for (let y = bbMinY; y <= bbMaxY; y += step) {
      if (pointInAnyPolygon(x, y, [ boundary ])) {
        interior.push({ x, y });
      }
    }
  }

  const allPts = [ ...boundary, ...interior ];

  const coords = allPts.map(p => [ p.x, p.y ]);
  const dela   = Delaunator.from(coords);
  const rawT   = dela.triangles;

  const idx = [];
  for (let i = 0; i < rawT.length; i += 3) {
    const [ a, b, c ] = [ rawT[i], rawT[i+1], rawT[i+2] ];
    const pa = allPts[a], pb = allPts[b], pc = allPts[c];
    const cx = (pa.x + pb.x + pc.x) / 3;
    const cy = (pa.y + pb.y + pc.y) / 3;
    if (pointInAnyPolygon(cx, cy, [ boundary ])) {
      idx.push(a, b, c);
    }
  }

  const verts   = [];
  const sprs    = [];

  for (let i = 0; i < allPts.length; i++) {
    const p = allPts[i];
    verts.push({
      id:         i,
      position:   new THREE.Vector3(p.x, initialClothHeight, p.y),
      isFixed:    0,
      springIds:  []
    });
  }

  function addSpring(i0, i1) {
    const v0 = verts[i0], v1 = verts[i1];

    if (v0.springIds.some(sid => {
      const sp = sprs[sid];
      return (sp.vertex0.id === i0 && sp.vertex1.id === i1)
          || (sp.vertex0.id === i1 && sp.vertex1.id === i0);
    })) return;
    const sid = sprs.length;
    sprs.push({ id: sid, vertex0: v0, vertex1: v1 });
    v0.springIds.push(sid);
    v1.springIds.push(sid);
  }

  for (let i = 0; i < idx.length; i += 3) {
    addSpring(idx[i],   idx[i+1]);
    addSpring(idx[i+1], idx[i+2]);
    addSpring(idx[i+2], idx[i]);
  }

  const initialPoss = verts.map(v => v.position.clone());

  return {
    vertices:         verts,
    springs:          sprs,
    initialPositions: initialPoss,
    indices:          new Uint32Array(idx)
  };
}