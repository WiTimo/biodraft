// ---- DXF import simplification helpers (Ramer–Douglas–Peucker) ----

function perpDistance(pt: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  // distance from pt to segment ab
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = pt.x - a.x;
  const wy = pt.y - a.y;
  const c = vx * vx + vy * vy;
  if (c === 0) return Math.sqrt(wx * wx + wy * wy);
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / c));
  const projx = a.x + t * vx;
  const projy = a.y + t * vy;
  const dx = pt.x - projx;
  const dy = pt.y - projy;
  return Math.sqrt(dx * dx + dy * dy);
}

function rdpCollectIndices(points: { x: number; y: number }[], start: number, end: number, eps: number, out: Set<number>) {
  // keep start/end
  if (start >= end) return;
  let maxDist = -1;
  let maxIdx = -1;
  const a = points[start];
  const b = points[end];
  for (let i = start + 1; i < end; i++) {
    const d = perpDistance(points[i], a, b);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > eps) {
    // keep the point and recurse
    out.add(maxIdx);
    rdpCollectIndices(points, start, maxIdx, eps, out);
    rdpCollectIndices(points, maxIdx, end, eps, out);
  } else {
    // no intermediate points required: nothing to add (endpoints handled by caller)
  }
}

export function simplifyWithPreserve(
  vertices: { x: number; y: number }[],
  eps: number,
  preserveIndices: Set<number>,
  closed: boolean
) {
  const n = vertices.length;
  if (n <= 2) return vertices.slice();

  // Always preserve endpoints of open polylines
  if (!closed) {
    preserveIndices.add(0);
    preserveIndices.add(n - 1);
  }

  const preserved = Array.from(preserveIndices).filter((i) => i >= 0 && i < n);
  if (preserved.length === 0) {
    // Nothing marked; run simple RDP on whole segment
    const out = new Set<number>();
    out.add(0);
    out.add(n - 1);
    rdpCollectIndices(vertices, 0, n - 1, eps, out);
    const indices = Array.from(out).sort((a, b) => a - b);
    return indices.map((i) => vertices[i]);
  }

  // Ensure preserved are sorted for iteration
  preserved.sort((a, b) => a - b);

  const keep = new Set<number>();

  if (!closed) {
    // process segments between preserved points
    for (let i = 0; i < preserved.length - 1; i++) {
      const s = preserved[i];
      const e = preserved[i + 1];
      // ensure endpoints kept
      keep.add(s);
      keep.add(e);
      if (e - s > 1) {
        const out = new Set<number>();
        rdpCollectIndices(vertices, s, e, eps, out);
        out.forEach((idx) => keep.add(idx));
      }
    }
  } else {
    // closed polyline: process each preserved pair including wrap-around
    for (let i = 0; i < preserved.length; i++) {
      const s = preserved[i];
      const e = preserved[(i + 1) % preserved.length];
      // compute segment length with wrap
      const segIndices: number[] = [];
      if (e > s) {
        for (let k = s; k <= e; k++) segIndices.push(k);
      } else {
        for (let k = s; k < n; k++) segIndices.push(k);
        for (let k = 0; k <= e; k++) segIndices.push(k);
      }
      // map segment to temporary array
      const tmpPoints = segIndices.map((idx) => vertices[idx]);
      // if segment is small, just keep endpoints
      if (tmpPoints.length <= 2) {
        keep.add(segIndices[0]);
        keep.add(segIndices[tmpPoints.length - 1]);
        continue;
      }
      const out = new Set<number>();
      // use rdpCollectIndices on tmpPoints with translated indices
      function rdpTmp(sidx: number, eidx: number) {
        // sidx/eidx are indices within tmpPoints
        let maxD = -1;
        let maxI = -1;
        const a = tmpPoints[sidx];
        const b = tmpPoints[eidx];
        for (let ii = sidx + 1; ii < eidx; ii++) {
          const d = perpDistance(tmpPoints[ii], a, b);
          if (d > maxD) {
            maxD = d;
            maxI = ii;
          }
        }
        if (maxD > eps) {
          out.add(maxI);
          rdpTmp(sidx, maxI);
          rdpTmp(maxI, eidx);
        }
      }
      out.add(0);
      out.add(tmpPoints.length - 1);
      rdpTmp(0, tmpPoints.length - 1);
      // map back kept indices to original indices
      for (const idx of Array.from(out)) {
        keep.add(segIndices[idx]);
      }
    }
  }

  // Build final ordered vertex list starting at 0
  const finalIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep.has(i)) finalIndices.push(i);
  }

  // If closed ensure the sequence is circularly continuous; if none preserved in order, fallback to first/last
  if (finalIndices.length === 0) return vertices.slice();
  return finalIndices.map((i) => vertices[i]);
}
