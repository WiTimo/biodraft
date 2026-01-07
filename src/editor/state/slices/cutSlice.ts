import type { CanvasStateCreator, CutPick, CutSlice, Point, Path, Segment } from '../types';
import { segmentsEqual } from '../utils';

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpPt(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function findPointIndex(points: Point[], id: string) {
  return points.findIndex((p) => p.id === id);
}

function isAdjacent(points: Point[], aIdx: number, bIdx: number) {
  if (aIdx < 0 || bIdx < 0) return false;
  return bIdx === (aIdx + 1) % points.length;
}

function splitSegmentAndInsert(points: Point[], segment: Segment, tRaw: number): { points: Point[]; insertedId: string } | null {
  const n = points.length;
  if (n < 2) return null;

  let t = clamp01(tRaw);
  let startId = segment[0];
  let endId = segment[1];

  let startIdx = findPointIndex(points, startId);
  let endIdx = findPointIndex(points, endId);

  // If the stored direction doesn't match adjacency, try flipping direction.
  if (!isAdjacent(points, startIdx, endIdx)) {
    const flippedStartIdx = findPointIndex(points, endId);
    const flippedEndIdx = findPointIndex(points, startId);
    if (isAdjacent(points, flippedStartIdx, flippedEndIdx)) {
      startId = endId;
      endId = segment[0];
      startIdx = flippedStartIdx;
      endIdx = flippedEndIdx;
      t = 1 - t;
    }
  }

  if (!isAdjacent(points, startIdx, endIdx)) return null;

  // Always insert a new cut point; clamp away from 0/1 to keep the math stable.
  const EPS = 1e-4;
  t = Math.max(EPS, Math.min(1 - EPS, t));

  const p0 = points[startIdx];
  const p1 = points[endIdx];

  const P0 = { x: p0.x, y: p0.y };
  const C0 = { x: p0.x + p0.handleOut.dx, y: p0.y + p0.handleOut.dy };
  const C1 = { x: p1.x + p1.handleIn.dx, y: p1.y + p1.handleIn.dy };
  const P1 = { x: p1.x, y: p1.y };

  // De Casteljau
  const A = lerpPt(P0, C0, t);
  const B = lerpPt(C0, C1, t);
  const C = lerpPt(C1, P1, t);
  const D = lerpPt(A, B, t);
  const E = lerpPt(B, C, t);
  const F = lerpPt(D, E, t);

  const insertedId = crypto.randomUUID();

  const updatedStart: Point = {
    ...p0,
    handleOut: { dx: A.x - P0.x, dy: A.y - P0.y },
  };

  const updatedEnd: Point = {
    ...p1,
    handleIn: { dx: C.x - P1.x, dy: C.y - P1.y },
  };

  const inserted: Point = {
    id: insertedId,
    x: F.x,
    y: F.y,
    handleIn: { dx: D.x - F.x, dy: D.y - F.y },
    handleOut: { dx: E.x - F.x, dy: E.y - F.y },
    // Best-effort: inherit seam allowance from the original outgoing edge
    seamRespectMm: p0.seamRespectMm,
  };

  const insertionIndex = startIdx + 1;
  const out = points.slice();
  out[startIdx] = updatedStart;

  // If insertion happens before endIdx, endIdx shifts by +1.
  const endIdxAfter = (startIdx < endIdx && insertionIndex <= endIdx) ? endIdx + 1 : endIdx;

  out.splice(insertionIndex, 0, inserted);
  out[endIdxAfter] = updatedEnd;

  return { points: out, insertedId };
}

function extractArc(points: Point[], startIdx: number, endIdx: number): Point[] {
  const out: Point[] = [];
  const n = points.length;
  let i = startIdx;
  // include start, include end
  for (let guard = 0; guard < n + 2; guard++) {
    out.push(points[i]);
    if (i === endIdx) break;
    i = (i + 1) % n;
  }
  return out;
}

function clonePointWithNewId(p: Point): Point {
  return {
    ...p,
    id: crypto.randomUUID(),
    handleIn: { ...p.handleIn },
    handleOut: { ...p.handleOut },
  };
}

function finalizeClosedCutPath(points: Point[]): Point[] {
  if (points.length === 0) return points;
  const first = points[0];
  const last = points[points.length - 1];

  // Close edge is last -> first. Make it a straight cut.
  const nextFirst: Point = {
    ...first,
    handleIn: { dx: 0, dy: 0 },
  };
  const nextLast: Point = {
    ...last,
    handleOut: { dx: 0, dy: 0 },
    // seamRespectMm applies to edge to next; last->first is the cut edge.
    seamRespectMm: undefined,
  };

  const out = points.slice();
  out[0] = nextFirst;
  out[out.length - 1] = nextLast;
  return out;
}

function splitClosedPathIntoTwo(path: Path, pick1: CutPick, pick2: CutPick): { a: Path; b: Path } | null {
  if (!path.closed) return null;
  if (path.points.length < 3) return null;

  // Work on a local points array so we can insert cut points.
  let working = path.points.slice();

  let pHi = pick1;
  let pLo = pick2;

  // Special-case: both picks on the same original segment direction.
  if (pick1.segment[0] === pick2.segment[0] && pick1.segment[1] === pick2.segment[1]) {
    if (pick1.t < pick2.t) {
      pHi = pick2;
      pLo = pick1;
    }
  }

  // Insert first cut point
  const ins1 = splitSegmentAndInsert(working, pHi.segment, pHi.t);
  if (!ins1) return null;
  working = ins1.points;

  // Insert second cut point
  let ins2: { points: Point[]; insertedId: string } | null = null;

  if (pHi.segment[0] === pLo.segment[0] && pHi.segment[1] === pLo.segment[1]) {
    // Second pick is on the same original segment, but now it lies on [start -> insertedHi]
    const denom = clamp01(pHi.t);
    if (denom <= 1e-4) return null;
    const localT = clamp01(pLo.t / denom);
    ins2 = splitSegmentAndInsert(working, [pHi.segment[0], ins1.insertedId], localT);
  } else {
    ins2 = splitSegmentAndInsert(working, pLo.segment, pLo.t);
  }

  if (!ins2) return null;
  working = ins2.points;

  const idA = ins1.insertedId;
  const idB = ins2.insertedId;
  if (idA === idB) return null;

  const idxA = findPointIndex(working, idA);
  const idxB = findPointIndex(working, idB);
  if (idxA < 0 || idxB < 0) return null;

  // Build the two arcs along the original direction.
  const arc1 = extractArc(working, idxA, idxB);
  const arc2 = extractArc(working, idxB, idxA);

  // Each resulting closed pattern needs its own endpoint points (cannot share).
  const buildPiece = (arc: Point[]) => {
    if (arc.length < 2) return null;

    const first = arc[0];
    const last = arc[arc.length - 1];

    const newFirst = clonePointWithNewId(first);
    const newLast = clonePointWithNewId(last);

    const middle = arc.slice(1, -1);

    const pts = finalizeClosedCutPath([newFirst, ...middle, newLast]);
    if (pts.length < 3) return null;

    return pts;
  };

  const ptsA = buildPiece(arc1);
  const ptsB = buildPiece(arc2);
  if (!ptsA || !ptsB) return null;

  const a: Path = {
    id: crypto.randomUUID(),
    points: ptsA,
    closed: true,
    texture: path.texture ?? null,
  };

  const b: Path = {
    id: crypto.randomUUID(),
    points: ptsB,
    closed: true,
    texture: path.texture ?? null,
  };

  return { a, b };
}

export const createCutSlice: CanvasStateCreator<CutSlice> = (set, get, _api) => ({
  cutPick1: null,
  cutPick2: null,
  clearCutPicks: () => set({ cutPick1: null, cutPick2: null }),
  addCutPick: (pick) => {
    const state = get();

    // If first pick is missing or user clicked a different path, start over.
    if (!state.cutPick1 || state.cutPick1.pathId !== pick.pathId) {
      set({ cutPick1: pick, cutPick2: null });
      return;
    }

    // If we already have two picks, treat the new click as a new first pick.
    if (state.cutPick1 && state.cutPick2) {
      set({ cutPick1: pick, cutPick2: null });
      return;
    }

    // Ignore near-identical second click
    const EPS = 1e-4;
    if (state.cutPick1 && segmentsEqual(state.cutPick1.segment, pick.segment) && Math.abs(state.cutPick1.t - pick.t) < EPS) {
      return;
    }

    set({ cutPick2: pick });

    // Commit cut immediately when we have two picks.
    const now = get();
    const p1 = now.cutPick1;
    const p2 = now.cutPick2;
    if (!p1 || !p2) return;

    const target = now.present.paths.find((p) => p.id === p1.pathId);
    if (!target) {
      set({ cutPick1: null, cutPick2: null });
      return;
    }

    if (!target.closed) {
      window.alert('Cut tool: please pick points on a CLOSED pattern border.');
      set({ cutPick1: null, cutPick2: null });
      return;
    }

    // Save undo snapshot
    now.saveState();

    const result = splitClosedPathIntoTwo(target, p1, p2);
    if (!result) {
      window.alert('Cut tool: could not cut there (try two distinct points that create two valid patterns).');
      set({ cutPick1: null, cutPick2: null });
      return;
    }

    // Replace the original path with the two new paths.
    set((s) => ({
      present: {
        ...s.present,
        paths: [...s.present.paths.filter((p) => p.id !== target.id), result.a, result.b],
      },
      cutPick1: null,
      cutPick2: null,
    }));

    // Clear any selection; user can select resulting pieces afterwards.
    const st = get();
    st.clearSelectedPointIds();
    st.deselectPoint();
  },
});
