// ClothHelpers.js
import * as THREE from 'three';
import Delaunator from 'delaunator';
import { pointInPolygon } from './utils.js';

export function buildPatterns(patternData, boundarySegments = 300) {
    if (!patternData || patternData.patterns.length !== 2) throw new Error();
    const halves = patternData.patterns.map(pat => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        pat.points.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const scl = 1 / Math.max(maxX - minX, maxY - minY);
        const norm = p => ({ x: (p.x - cx) * scl, y: (p.y - cy) * scl });
        const shape = new THREE.Shape();
        const P0 = norm(pat.points[0]);
        shape.moveTo(P0.x, P0.y);
        for (let i = 1; i < pat.points.length; i++) {
            const A = pat.points[i - 1], B = pat.points[i];
            const nA = norm(A), nB = norm(B);
            const hasBez = (A.handleOut?.dx || A.handleOut?.dy) || (B.handleIn?.dx || B.handleIn?.dy);
            if (hasBez) {
                const cp1 = norm({ x: A.x + (A.handleOut?.dx || 0), y: A.y + (A.handleOut?.dy || 0) });
                const cp2 = norm({ x: B.x + (B.handleIn?.dx || 0), y: B.y + (B.handleIn?.dy || 0) });
                shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, nB.x, nB.y);
            } else {
                shape.lineTo(nB.x, nB.y);
            }
        }
        shape.lineTo(P0.x, P0.y);
        const boundary = shape.getSpacedPoints(boundarySegments);
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
        const pts2D = boundary.concat(interior);
        const dela = Delaunator.from(pts2D.map(p => [p.x, p.y]));
        const idx = [];
        for (let i = 0; i < dela.triangles.length; i += 3) {
            const a = dela.triangles[i], b = dela.triangles[i + 1], c = dela.triangles[i + 2];
            const pa = pts2D[a], pb = pts2D[b], pc = pts2D[c];
            const mx = (pa.x + pb.x + pc.x) / 3, my = (pa.y + pb.y + pc.y) / 3;
            if (pointInPolygon(mx, my, boundary)) idx.push(a, b, c);
        }
        return { norm, boundary, pts2D, idx, original: pat.points };
    });
    const Apts = halves[0].pts2D;
    const Bpts = halves[1].pts2D;
    const allPts = Apts.concat(Bpts);
    const globalIdx = halves[0].idx.concat(halves[1].idx.map(i => i + Apts.length));
    return { halves, Apts, Bpts, globalIdx };
}

export function buildCloth(halves, Apts, Bpts, globalIdx, initialClothHeight, separationY, scene, Compute) {
    const quatX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const quatY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
    const allPts = Apts.concat(Bpts);
    const verletVertices = allPts.map((p, i) => {
        const offsetY = initialClothHeight + (i < Apts.length ? -separationY : separationY);
        const pos = new THREE.Vector3(p.x, offsetY, p.y);
        if (i >= Apts.length) pos.applyQuaternion(quatY);
        pos.applyQuaternion(quatX);
        return { id: i, position: pos, isFixed: 0, springIds: [] };
    });
    // ——— PIN TOP & BOTTOM EDGES ———
    // Compute the normalized Y range from your 2D pattern points:
    const all2DYs = Apts.map(p => p.y).concat(Bpts.map(p => p.y));
    const yMax = Math.max(...all2DYs), yMin = Math.min(...all2DYs);
    const pinTol = 1e-3;

    // Any vertex whose world‑Y equals yMax or yMin (within tolerance) gets locked:
    verletVertices.forEach(v => {
        // After the X‑ then Y‑quaternions, v.position.y == original normalized p.y
        if (Math.abs(v.position.y - yMax) < pinTol ||
            Math.abs(v.position.y - yMin) < pinTol) {
            v.isFixed = 1;
        }
    });
    // ——— end pin block ———
    const verletSprings = [], seamDebugPairs = [];
    function addSpring(i0, i1) {
        const v0 = verletVertices[i0], v1 = verletVertices[i1];
        for (const sid of v0.springIds) {
            const sp = verletSprings[sid];
            if ((sp.v0 === i0 && sp.v1 === i1) || (sp.v0 === i1 && sp.v1 === i0)) return;
        }
        const sid = verletSprings.length;
        verletSprings.push({ v0: i0, v1: i1 });
        v0.springIds.push(sid);
        v1.springIds.push(sid);
    }
    for (let i = 0; i < globalIdx.length; i += 3) {
        addSpring(globalIdx[i], globalIdx[i + 1]);
        addSpring(globalIdx[i + 1], globalIdx[i + 2]);
        addSpring(globalIdx[i + 2], globalIdx[i]);
    }
    function getBoundaryIndex(pid, half) {
        const po = half.original.find(p => p.id === pid);
        const np = half.norm(po);
        let best = 0, d2 = Infinity;
        half.boundary.forEach((v, i) => { const dd = (v.x - np.x) ** 2 + (v.y - np.y) ** 2; if (dd < d2) { d2 = dd; best = i; } })
        return best;
    }
    function getBoundarySequence(start, end, N) {
        const seqF = [], seqB = [];
        let cur = start;
        do { seqF.push(cur); cur = (cur + 1) % N; } while (cur !== (end + 1) % N);
        cur = start;
        do { seqB.push(cur); cur = (cur - 1 + N) % N; } while (cur !== (end - 1 + N) % N);
        return seqF.length <= seqB.length ? seqF : seqB;
    }
    for (const seam of patternData.seams) {
        const [aPair, bPair] = seam;
        const half0 = new Set(patternData.patterns[0].points.map(p => p.id)).has(aPair[0]) ? aPair : bPair;
        const half1 = half0 === aPair ? bPair : aPair;
        let seq0 = getBoundarySequence(getBoundaryIndex(half0[0], halves[0]), getBoundaryIndex(half0[1], halves[0]), halves[0].boundary.length);
        let seq1 = getBoundarySequence(getBoundaryIndex(half1[0], halves[1]), getBoundaryIndex(half1[1], halves[1]), halves[1].boundary.length);
        const L = Math.max(seq0.length, seq1.length);
        const resample = seq => Array.from({ length: L }, (_, k) => seq[Math.floor(k * seq.length / L)]);
        if (seq0.length !== L) seq0 = resample(seq0);
        if (seq1.length !== L) seq1 = resample(seq1);
        for (let k = 0; k < L; k++) {
            const i0 = seq0[k], i1 = seq1[k] + Apts.length;
            addSpring(i0, i1);
            seamDebugPairs.push([i0, i1]);
        }
    }
    Compute.setupBuffers(verletVertices, verletSprings, seamDebugPairs);
    Compute.setupUniforms(params);
    const geom = new THREE.BufferGeometry();
    geom.setIndex(new THREE.BufferAttribute(new Uint32Array(globalIdx), 1));
    const vid = Uint32Array.from({ length: verletVertices.length }, (_, i) => i);
    geom.setAttribute('vertexId', new THREE.BufferAttribute(vid, 1));
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verletVertices.length * 3), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verletVertices.length * 3), 3));
    const clothMaterial = new THREE.MeshPhysicalNodeMaterial({ color: 0x204080, side: THREE.DoubleSide, roughness: 1, metalness: 0.3 });
    clothMaterial.positionNode = Compute.vertexPositionBuffer.element(attribute('vertexId'));
    const clothMesh = new THREE.Mesh(geom, clothMaterial);
    clothMesh.frustumCulled = false;
    scene.add(clothMesh);
    const lineGeo = new THREE.BufferGeometry();
    const posArr = new Float32Array(seamDebugPairs.length * 6);
    seamDebugPairs.forEach(([i0, i1], k) => {
        const p0 = verletVertices[i0].position, p1 = verletVertices[i1].position;
        posArr.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], k * 6);
    });
    lineGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage));
    const seamLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xff0000 }));
    scene.add(seamLines);
}