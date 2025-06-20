// js/init/patternSampler.js

import * as THREE from 'three';
import Delaunator from 'delaunator';
import { pointInPolygon } from '../utils.js';

export function samplePatterns(patternData) {
  const ids0 = new Set(patternData.patterns[0].points.map(p => p.id));
  const boundarySegments    = 300;
  const initialClothHeight  = 0.15 + 0.5;
  const separationY         = 0.2;

  const halves = patternData.patterns.map(pat => {
    // [A] normalize
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pat.points.forEach(p => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const scl = 1 / Math.max(maxX - minX, maxY - minY);
    const norm = p => ({ x: (p.x - cx) * scl, y: (p.y - cy) * scl });

    // [B] Bézier boundary
    const shape = new THREE.Shape();
    const P0 = norm(pat.points[0]);
    shape.moveTo(P0.x, P0.y);
    for (let i = 1; i < pat.points.length; i++) {
      const A = pat.points[i - 1], B = pat.points[i];
      const nA = norm(A), nB = norm(B);
      const hasBez = (A.handleOut.dx || A.handleOut.dy)
                   || (B.handleIn.dx  || B.handleIn.dy);
      if (hasBez) {
        const cp1 = norm({ x: A.x + (A.handleOut.dx||0), y: A.y + (A.handleOut.dy||0) });
        const cp2 = norm({ x: B.x + (B.handleIn.dx||0),  y: B.y + (B.handleIn.dy||0) });
        shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, nB.x, nB.y);
      } else {
        shape.lineTo(nB.x, nB.y);
      }
    }
    shape.lineTo(P0.x, P0.y);
    const boundary = shape.getSpacedPoints(boundarySegments);

    // [C] interior sampling
    let bbMinX = Infinity, bbMaxX = -Infinity, bbMinY = Infinity, bbMaxY = -Infinity;
    boundary.forEach(v => {
      bbMinX = Math.min(bbMinX, v.x);
      bbMaxX = Math.max(bbMaxX, v.x);
      bbMinY = Math.min(bbMinY, v.y);
      bbMaxY = Math.max(bbMaxY, v.y);
    });
    const interior = [];
    for (let x = bbMinX; x <= bbMaxX; x += 0.02) {
      for (let y = bbMinY; y <= bbMaxY; y += 0.02) {
        if (pointInPolygon(x, y, boundary)) interior.push({ x, y });
      }
    }

    // [D] Delaunay + centroid‐inside filter
    const pts2D = boundary.concat(interior);
    const coords = pts2D.map(p => [p.x, p.y]);
    const dela = Delaunator.from(coords);
    const idx  = [];
    for (let i = 0; i < dela.triangles.length; i += 3) {
      const [a,b,c] = [dela.triangles[i], dela.triangles[i+1], dela.triangles[i+2]];
      const pa = pts2D[a], pb = pts2D[b], pc = pts2D[c];
      const mx = (pa.x+pb.x+pc.x)/3, my = (pa.y+pb.y+pc.y)/3;
      if (pointInPolygon(mx, my, boundary)) idx.push(a,b,c);
    }

    return { norm, boundary, pts2D, idx, original: pat.points };
  });

  return { halves, ids0, boundarySegments, initialClothHeight, separationY };
}
