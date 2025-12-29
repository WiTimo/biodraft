import { useCanvasState } from '../state/CanvasState';
import type { BackgroundImage, Path, Point, Segment, SegmentPortion } from '../state/types';

// Tolerance for considering two points as overlapping (in pixels)
const POINT_OVERLAP_TOLERANCE = 5;

// Canvas split line between front/back drawing areas.
// We keep editor behavior as-is (it already uses x=700 as a visual divider),
// but export normalizes coordinates so each side has a consistent local origin.
const FRONT_BACK_SPLIT_X = 700;

const FRONT_IMAGE_ID = 'static-man';
const BACK_IMAGE_ID = 'static-man-back';

type PatternSide = 'front' | 'back';

function inferPatternSideFromPath(path: Path): PatternSide {
  if (path.points.length === 0) return 'front';

  const meanX = path.points.reduce((sum, p) => sum + p.x, 0) / path.points.length;
  return meanX < FRONT_BACK_SPLIT_X ? 'front' : 'back';
}

function seamPartToSegment(part: Segment | SegmentPortion): Segment {
  return Array.isArray(part) ? part : part.segment;
}

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
    if (d > maxDist) { maxDist = d; maxIdx = i; }
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

function simplifyWithPreserve(
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
        let maxD = -1; let maxI = -1;
        const a = tmpPoints[sidx];
        const b = tmpPoints[eidx];
        for (let ii = sidx + 1; ii < eidx; ii++) {
          const d = perpDistance(tmpPoints[ii], a, b);
          if (d > maxD) { maxD = d; maxI = ii; }
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

// ---- curve helpers: arc/bulge/ellipse conversions to cubic beziers ----

function arcToBeziers(center: {x:number,y:number}, r:number, startA:number, endA:number) {
  let delta = endA - startA;
  // normalize delta to (-2pi,2pi)
  while (delta <= -Math.PI * 2) delta += Math.PI * 2;
  while (delta > Math.PI * 2) delta -= Math.PI * 2;

  // Respect direction sign; split into segments of at most 90 degrees
  const segCount = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / segCount;
  const segs: any[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = startA + i * step;
    const b = a + step;
    const p0 = { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) };
    const p3 = { x: center.x + r * Math.cos(b), y: center.y + r * Math.sin(b) };
    const t = step;
    const k = (4 / 3) * Math.tan(t / 4) * r;
    const p1 = { x: p0.x + k * (-Math.sin(a)), y: p0.y + k * Math.cos(a) };
    const p2 = { x: p3.x + k * (Math.sin(b)), y: p3.y + k * (-Math.cos(b)) };
    segs.push({ p0, p1, p2, p3 });
  }
  return segs;
}

function bulgeToBeziers(a:{x:number,y:number}, b:{x:number,y:number}, closed:boolean) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9) return [];
  const bulge = a.bulge ?? 0;
  const theta = 4 * Math.atan(bulge);
  if (Math.abs(theta) < 1e-6) {
    return [{ p0: { x: a.x, y: a.y }, p1: { x: (a.x * 2 + b.x) / 3, y: (a.y * 2 + b.y) / 3 }, p2: { x: (a.x + 2 * b.x) / 3, y: (a.y + 2 * b.y) / 3 }, p3: { x: b.x, y: b.y } }];
  }
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const h = Math.sqrt(Math.max(0, r * r - (chord / 2) * (chord / 2)));
  // perpendicular direction
  const px = -dy / chord;
  const py = dx / chord;
  const dir = bulge >= 0 ? 1 : -1;
  const cx = mid.x + px * h * dir;
  const cy = mid.y + py * h * dir;
  const startA = Math.atan2(a.y - cy, a.x - cx);
  const endA = startA + theta;
  return arcToBeziers({ x: cx, y: cy }, r, startA, endA);
}

function ellipseToBeziers(center:{x:number,y:number}, major:{x:number,y:number}, ratio:number, startParam:number, endParam:number) {
  // major is vector to ellipse endpoint at parameter 0; minor vector = rotate90(major) * ratio
  const minor = { x: -major.y * ratio, y: major.x * ratio };
  const delta = endParam - startParam;
  const segCount = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const segs: any[] = [];
  for (let i = 0; i < segCount; i++) {
    const u0 = startParam + (i / segCount) * delta;
    const u1 = startParam + ((i + 1) / segCount) * delta;
    const p0 = { x: center.x + major.x * Math.cos(u0) + minor.x * Math.sin(u0), y: center.y + major.y * Math.cos(u0) + minor.y * Math.sin(u0) };
    const p3 = { x: center.x + major.x * Math.cos(u1) + minor.x * Math.sin(u1), y: center.y + major.y * Math.cos(u1) + minor.y * Math.sin(u1) };
    // derivatives w.r.t parameter u
    const d0 = { x: -major.x * Math.sin(u0) + minor.x * Math.cos(u0), y: -major.y * Math.sin(u0) + minor.y * Math.cos(u0) };
    const d1 = { x: -major.x * Math.sin(u1) + minor.x * Math.cos(u1), y: -major.y * Math.sin(u1) + minor.y * Math.cos(u1) };
    const du = u1 - u0;
    const p1 = { x: p0.x + d0.x * (du / 3), y: p0.y + d0.y * (du / 3) };
    const p2 = { x: p3.x - d1.x * (du / 3), y: p3.y - d1.y * (du / 3) };
    segs.push({ p0, p1, p2, p3 });
  }
  return segs;
}

function getBackgroundCenter(backgroundImages: BackgroundImage[], id: string): { x: number; y: number } | null {
  const img = backgroundImages.find((b) => b.id === id);
  if (!img) return null;
  if (typeof img.nativeWidth !== 'number' || typeof img.nativeHeight !== 'number') return null;
  return {
    x: img.x + (img.nativeWidth * img.scaleX) / 2,
    y: img.y + (img.nativeHeight * img.scaleY) / 2,
  };
}

function getSideOrigin(
  side: PatternSide,
  opts: { manImageCenters: Record<string, { x: number; y: number }>; backgroundImages: BackgroundImage[] }
): { x: number; y: number } {
  const id = side === 'front' ? FRONT_IMAGE_ID : BACK_IMAGE_ID;
  const center = opts.manImageCenters[id] ?? getBackgroundCenter(opts.backgroundImages, id);
  if (center) return center;

  // Fallback to previous behavior (back normalized by split line; front unchanged)
  return { x: side === 'back' ? FRONT_BACK_SPLIT_X : 0, y: 0 };
}

interface PointWithPath {
  point: Point;
  pathId: string;
  pathIndex: number;
  pointIndex: number;
}

interface SharedPointGroup {
  canonicalPoint: Point;
  pathIds: string[];
  instances: PointWithPath[];
}

/**
 * Check if two points are close enough to be considered overlapping
 */
function arePointsOverlapping(p1: Point, p2: Point, tolerance = POINT_OVERLAP_TOLERANCE): boolean {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy) <= tolerance;
}

/**
 * Find all groups of overlapping points across all paths
 */
function findSharedPoints(paths: Path[]): SharedPointGroup[] {
  const allPoints: PointWithPath[] = [];
  
  // Collect all points with their path context
  paths.forEach((path, pathIndex) => {
    path.points.forEach((point, pointIndex) => {
      allPoints.push({
        point,
        pathId: path.id,
        pathIndex,
        pointIndex,
      });
    });
  });

  const sharedGroups: SharedPointGroup[] = [];
  const processedIndices = new Set<number>();

  // Group overlapping points
  allPoints.forEach((pointWithPath, index) => {
    if (processedIndices.has(index)) return;

    const group: PointWithPath[] = [pointWithPath];
    processedIndices.add(index);

    // Find all other points that overlap with this one
    for (let i = index + 1; i < allPoints.length; i++) {
      if (processedIndices.has(i)) continue;
      
      if (arePointsOverlapping(pointWithPath.point, allPoints[i].point)) {
        group.push(allPoints[i]);
        processedIndices.add(i);
      }
    }

    // Only create a shared group if the point appears in multiple paths
    const uniquePathIds = new Set(group.map(p => p.pathId));
    if (uniquePathIds.size > 1) {
      sharedGroups.push({
        canonicalPoint: pointWithPath.point, // Use first point as canonical
        pathIds: Array.from(uniquePathIds),
        instances: group,
      });
    }
  });

  return sharedGroups;
}

/**
 * Group paths into patterns based on shared points
 * Paths that share points belong to different patterns but have common boundary points
 */
function groupPathsIntoPatterns(paths: Path[]): { patternGroups: Path[][], sharedPoints: SharedPointGroup[] } {
  const sharedPoints = findSharedPoints(paths);
  
  // For now, we keep each path as a separate pattern, but we'll export shared points in both
  // In the future, you might want to merge paths that are actually the same pattern
  const patternGroups = paths.map(path => [path]);

  return { patternGroups, sharedPoints };
}

/**
 * Clean up empty paths from the canvas state
 * This removes any paths that have no points
 */
export function cleanupEmptyPaths() {
  const state = useCanvasState.getState();
  const validPaths = state.present.paths.filter(path => path.points.length > 0);
  
  if (validPaths.length !== state.present.paths.length) {
    useCanvasState.setState((prev) => ({
      present: {
        ...prev.present,
        paths: validPaths,
      },
    }));
    console.log(`Cleaned up ${state.present.paths.length - validPaths.length} empty paths`);
  }
}

export function exportToJson() {
  const state = useCanvasState.getState();
  const { paths, seams, backgroundImages } = state.present;
  const { manImageCenters } = state;

  // Filter out empty paths (paths with no points)
  const validPaths = paths.filter(path => path.points.length > 0);

  if (validPaths.length === 0) {
    alert('No patterns to export. Please create at least one pattern with points.');
    return;
  }

  if (validPaths.length !== paths.length) {
    console.log(`Note: Skipping ${paths.length - validPaths.length} empty path(s) during export`);
  }

  // Build set of valid point IDs from remaining paths
  const validPointIds = new Set<string>();
  validPaths.forEach(path => {
    path.points.forEach(point => validPointIds.add(point.id));
  });

  // Filter out orphaned seams (seams that reference non-existent points)
  const validSeams = seams.filter((seam) => {
    const [partA, partB] = seam;
    const segA = seamPartToSegment(partA);
    const segB = seamPartToSegment(partB);
    const [p1, p2] = segA;
    const [p3, p4] = segB;
    return validPointIds.has(p1) && validPointIds.has(p2) && validPointIds.has(p3) && validPointIds.has(p4);
  });
  
  if (validSeams.length !== seams.length) {
    console.log(`Note: Cleaned up ${seams.length - validSeams.length} orphaned seam(s) during export`);
  }

  const { sharedPoints } = groupPathsIntoPatterns(validPaths);

  // Create a map of shared points for quick lookup
  const sharedPointMap = new Map<string, SharedPointGroup>();
  sharedPoints.forEach(group => {
    group.instances.forEach(instance => {
      const key = `${instance.pathId}-${instance.pointIndex}`;
      sharedPointMap.set(key, group);
    });
  });

  const exportData = validPaths.map((path) => {
    const side = inferPatternSideFromPath(path);
    const origin = getSideOrigin(side, { manImageCenters, backgroundImages });

    const exportedPoints = path.points.map((p, pointIndex) => {
      const key = `${path.id}-${pointIndex}`;
      const sharedGroup = sharedPointMap.get(key);
      
      return {
        id: p.id,
        x: p.x - origin.x,
        y: p.y - origin.y,
        handleIn: { dx: p.handleIn.dx, dy: p.handleIn.dy },
        handleOut: { dx: p.handleOut.dx, dy: p.handleOut.dy },
        // include optional seam allowance in mm for edge from this point to next
        ...(typeof p.seamRespectMm === 'number' ? { seamRespectMm: p.seamRespectMm } : {}),
        // Mark if this point is shared with other patterns
        ...(sharedGroup ? { 
          shared: true,
          sharedWithPatterns: sharedGroup.pathIds.filter(id => id !== path.id)
        } : {}),
      };
    });

    return {
      id: path.id,
      side,
      points: exportedPoints,
      closed: path.closed,
      texture: path.texture
        ? {
            src: path.texture.src,
            scaleX: path.texture.scaleX ?? 1,
            scaleY: path.texture.scaleY ?? 1,
            offsetX: (path.texture.offsetX ?? 0) - origin.x,
            offsetY: (path.texture.offsetY ?? 0) - origin.y,
            rotation: path.texture.rotation ?? 0,
            repeat: path.texture.repeat ?? 'repeat',
          }
        : null,
    };
  });

  const blob = new Blob(
    [JSON.stringify({ patterns: exportData, seams: validSeams, sharedPoints: sharedPoints.length }, null, 2)],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'patterns_with_seams_and_textures.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function importFromJson(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    if (!reader.result) return;

    const parsed = JSON.parse(reader.result as string);
    if (!parsed.patterns) return;

    const state = useCanvasState.getState();
    const { backgroundImages } = state.present;
    const { manImageCenters } = state;

    const newPaths = parsed.patterns.map((pattern: any) => {
      const side = pattern.side as PatternSide | undefined;
      const origin = getSideOrigin(side === 'back' ? 'back' : 'front', { manImageCenters, backgroundImages });

      return {
      id: pattern.id,
      closed: pattern.closed,
      points: pattern.points.map((p: any) => ({
        id: p.id,
          x: p.x + origin.x,
          y: p.y + origin.y,
        handleIn: { dx: p.handleIn.dx, dy: p.handleIn.dy },
        handleOut: { dx: p.handleOut.dx, dy: p.handleOut.dy },
        seamRespectMm: typeof p.seamRespectMm === 'number' ? p.seamRespectMm : undefined,
      })),
      texture: pattern.texture
        ? {
            src: pattern.texture.src,
            scaleX: pattern.texture.scaleX ?? 1,
            scaleY: pattern.texture.scaleY ?? 1,
              offsetX: (pattern.texture.offsetX ?? 0) + origin.x,
              offsetY: (pattern.texture.offsetY ?? 0) + origin.y,
            rotation: pattern.texture.rotation ?? 0,
            repeat: pattern.texture.repeat ?? 'repeat',
          }
        : null,
      };
    });

    const parsedSeams = (parsed.seams || []) as [[string, string], [string, string]][];

    useCanvasState.setState((prev) => ({
      present: {
        ...prev.present,
        paths: [...prev.present.paths, ...newPaths],
        seams: parsedSeams,
      },
    }));
  };

  reader.readAsText(file);
}

/**
 * Minimal DXF exporter supporting POLYLINE (as PATH) and LINE (as SEAMS).
 * Exports absolute canvas coordinates. Each pattern is written as a POLYLINE
 * on a layer named PATTERN_<id>_<side> and seams are written on a layer named SEAMS.
 */
export function exportToDxf() {
  const state = useCanvasState.getState();
  const { paths, seams } = state.present;

  const validPaths = paths.filter((p) => p.points.length > 0);
  if (validPaths.length === 0) {
    alert('No patterns to export. Please create at least one pattern with points.');
    return;
  }

  const stateScale = useCanvasState.getState().dxfScale ?? 1;

  const lines: string[] = [];
  const push = (s: string) => lines.push(s);

  push('0');
  push('SECTION');
  push('2');
  push('ENTITIES');

  for (const path of validPaths) {
    const side = inferPatternSideFromPath(path);
    const layer = `PATTERN_${path.id}_${side}`;

    // POLYLINE header
    push('0');
    push('POLYLINE');
    push('8'); push(layer);
    push('66'); push('1'); // vertices follow
    push('70'); push(path.closed ? '1' : '0');

    // vertices (scaled by stateScale)
    for (const pt of path.points) {
      const sx = (pt.x * stateScale).toFixed(4);
      const sy = (pt.y * stateScale).toFixed(4);
      push('0');
      push('VERTEX');
      push('8'); push(layer);
      push('10'); push(String(sx));
      push('20'); push(String(sy));
      push('30'); push('0');
    }

    // SEQEND
    push('0');
    push('SEQEND');
    push('8'); push(layer);
  }

  // seams as LINE entities
  for (const seam of seams) {
    const [a, b] = seam;
    const segA = seamPartToSegment(a);
    const segB = seamPartToSegment(b);
    const [p1Id, p2Id] = segA;
    const [p3Id, p4Id] = segB;

    // Try to find point coords in current paths
    const ptMap = new Map<string, {x:number,y:number}>();
    for (const p of validPaths) {
      for (const pt of p.points) ptMap.set(pt.id, { x: pt.x, y: pt.y });
    }

    const p1 = ptMap.get(p1Id);
    const p3 = ptMap.get(p3Id);

    if (!p1 || !p3) continue; // skip if unresolved

    push('0'); push('LINE');
    push('8'); push('SEAMS');
    push('10'); push(String((p1.x * stateScale).toFixed(4)));
    push('20'); push(String((p1.y * stateScale).toFixed(4)));
    push('30'); push('0');
    push('11'); push(String((p3.x * stateScale).toFixed(4)));
    push('21'); push(String((p3.y * stateScale).toFixed(4)));
    push('31'); push('0');
  }

  push('0');
  push('ENDSEC');
  push('0');
  push('EOF');

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'patterns_with_seams.dxf';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Minimal DXF import that understands the DXF we export: POLYLINE/VERTEX and LINE entities.
 * It creates paths from POLYLINEs and tries to reconstruct seams from LINEs by nearest-point matching.
 */
export function importFromDxf(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    if (!reader.result) return;
    const text = reader.result as string;
    const lines = text.split(/\r?\n/).map(l => l.trim());

    type DxfPolyline = { layer: string; vertices: {x:number,y:number}[]; closed: boolean };
    const stateScale = useCanvasState.getState().dxfScale ?? 1;

    const polylines: DxfPolyline[] = [];
    const seamLines: { x1:number,y1:number,x2:number,y2:number }[] = [];

    let i = 0;
    while (i < lines.length) {
      const code = lines[i++] || '';
      const value = lines[i++] || '';
      if (code === '0' && value === 'POLYLINE') {
        let layer = '0';
        let closed = false;
        const vertices: {x:number,y:number}[] = [];
        // read block until SEQEND
        while (i < lines.length) {
          const c = lines[i++] || '';
          const v = lines[i++] || '';
          if (c === '0' && v === 'SEQEND') break;
          if (c === '8') layer = v;
          if (c === '70') closed = v === '1';
          if (c === '0' && v === 'VERTEX') {
            let vx = 0, vy = 0;
            // read vertex's group pairs until next 0 or group
            while (i < lines.length) {
              const cc = lines[i++] || '';
              const vv = lines[i++] || '';
              if (cc === '0') { i -= 2; break; }
              if (cc === '10') vx = Number(vv);
              if (cc === '20') vy = Number(vv);
            }
            // convert from file units to editor units by dividing by scale
            vertices.push({ x: vx / stateScale, y: vy / stateScale });
          }
        }
        polylines.push({ layer, vertices, closed });
      }

      if (code === '0' && value === 'SPLINE') {
        // parse spline entity: collect degree, control points, knots, weights
        let degree = 3;
        const ctrlPts: {x:number,y:number}[] = [];
        const knots: number[] = [];
        const weights: number[] = [];
        let closed = false;

        while (i < lines.length) {
          const c = lines[i++] || '';
          const v = lines[i++] || '';
          if (c === '0') { i -= 2; break; }
          // basic codes: 71 = degree, 10/20 = control point, 40 = knot, 41 = weight, 70 flags
          if (c === '71') degree = Number(v);
          if (c === '70') {
            const flags = Number(v);
            closed = !!(flags & 1); // spline closed flag in some DXF versions
          }
          if (c === '10') {
            const x = Number(v);
            // next expected is 20
            const cc = lines[i++] || '';
            const vv = lines[i++] || '';
            if (cc === '20') {
              const y = Number(vv);
              ctrlPts.push({ x: x / stateScale, y: y / stateScale });
            } else {
              // unexpected, backtrack
              i -= 2;
            }
          }
          if (c === '40') knots.push(Number(v));
          if (c === '41') weights.push(Number(v));
        }

        // store spline
        polylines.push({ layer: `SPLINE`, vertices: [], closed });
        // we'll create path entries from splines below by storing a custom object in an attached map
        (polylines[polylines.length - 1] as any).spline = { degree, ctrlPts, knots, weights };
      }

      if (code === '0' && value === 'LWPOLYLINE') {
        // lightweight polyline with optional bulge (arc) per vertex
        const verts: { x:number,y:number, bulge?:number }[] = [];
        let closed = false;
        // LWPOLYLINE encodes vertices as repeating 10/20 and optional 42 for bulge
        let expectVertex: { x?: number, y?: number, bulge?: number } | null = null;
        while (i < lines.length) {
          const c = lines[i++] || '';
          const v = lines[i++] || '';
          if (c === '0') { i -= 2; break; }
          if (c === '70') {
            const flags = Number(v);
            closed = !!(flags & 1);
          }
          if (c === '10' || c === '20') {
            // start or continue a vertex
            if (!expectVertex) expectVertex = {};
            if (c === '10') expectVertex.x = Number(v) / stateScale;
            if (c === '20') expectVertex.y = Number(v) / stateScale;
            // if we have both push
            if (expectVertex.x !== undefined && expectVertex.y !== undefined) {
              verts.push({ x: expectVertex.x, y: expectVertex.y, bulge: expectVertex.bulge });
              expectVertex = null;
            }
          }
          if (c === '42') {
            if (!expectVertex) expectVertex = {};
            expectVertex.bulge = Number(v);
          }
        }

        // convert bulges to bezier segments appended to a new poly structure
        const bezSegments: any[] = [];
        for (let vi = 0; vi < verts.length; vi++) {
          const a = verts[vi];
          const b = verts[(vi + 1) % verts.length];
          const isLast = vi === verts.length - 1;
          if (a.bulge && Math.abs(a.bulge) > 1e-6) {
            // convert bulge for arc from a to b
            const segs = bulgeToBeziers(a, b, !!(closed && isLast));
            for (const s of segs) bezSegments.push(s);
          } else {
            // straight segment; represent as degenerate bezier
            bezSegments.push({ p0: { x: a.x, y: a.y }, p1: { x: (a.x * 2 + b.x) / 3, y: (a.y * 2 + b.y) / 3 }, p2: { x: (a.x + 2 * b.x) / 3, y: (a.y + 2 * b.y) / 3 }, p3: { x: b.x, y: b.y } });
          }
        }

        polylines.push({ layer: `PATTERN_lwp`, vertices: [], closed, bezierSegments: bezSegments });
      }

      if (code === '0' && value === 'ARC') {
        // ARC: center (10/20), radius (40), start angle (50), end angle (51)
        let cx = 0, cy = 0, r = 0, startA = 0, endA = 0;
        while (i < lines.length) {
          const c = lines[i++] || '';
          const v = lines[i++] || '';
          if (c === '0') { i -= 2; break; }
          if (c === '10') cx = Number(v) / stateScale;
          if (c === '20') cy = Number(v) / stateScale;
          if (c === '40') r = Number(v) / stateScale;
          if (c === '50') startA = Number(v) * (Math.PI / 180);
          if (c === '51') endA = Number(v) * (Math.PI / 180);
        }
        // convert arc to bezier segments (one or more)
        const segs = arcToBeziers({ x: cx, y: cy }, r, startA, endA);
        polylines.push({ layer: `PATTERN_arc`, vertices: [], closed: false, bezierSegments: segs });
      }

      if (code === '0' && value === 'ELLIPSE') {
        // ELLIPSE parsing (approximated via sampling to bezier)
        let cx = 0, cy = 0, ax = 1, ay = 0, ratio = 1, startParam = 0, endParam = 2 * Math.PI, closed = false;
        while (i < lines.length) {
          const c = lines[i++] || '';
          const v = lines[i++] || '';
          if (c === '0') { i -= 2; break; }
          if (c === '10') cx = Number(v) / stateScale;
          if (c === '20') cy = Number(v) / stateScale;
          if (c === '11') ax = Number(v) / stateScale;
          if (c === '21') ay = Number(v) / stateScale;
          if (c === '40') ratio = Number(v); // ratio of minor axis to major
          if (c === '41') startParam = Number(v);
          if (c === '42') endParam = Number(v);
        }
        // sample ellipse into bezier segments
        const segs = ellipseToBeziers({ x: cx, y: cy }, { x: ax, y: ay }, ratio, startParam, endParam);
        polylines.push({ layer: `PATTERN_ellipse`, vertices: [], closed: false, bezierSegments: segs });
      }

      if (code === '0' && value === 'LINE') {
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0, layer = '0';
        // read properties of line
        while (i < lines.length) {
          const c = lines[i++] || '';
          const v = lines[i++] || '';
          if (c === '0') { i -= 2; break; }
          if (c === '10') x1 = Number(v);
          if (c === '20') y1 = Number(v);
          if (c === '11') x2 = Number(v);
          if (c === '21') y2 = Number(v);
          if (c === '8') layer = v;
        }
        // convert to editor units
        seamLines.push({ x1: x1 / stateScale, y1: y1 / stateScale, x2: x2 / stateScale, y2: y2 / stateScale });
      }
    }

    // Optionally simplify polylines to reduce dense point clouds (RDP), preserving seam anchors
    const simplifyEnabled = useCanvasState.getState().dxfSimplifyEnabled ?? true;
    const simplifyTolerance = useCanvasState.getState().dxfSimplifyTolerance ?? 2;

    // Helper: evaluate NURBS/B-spline at parameter u using de Boor with homogeneous coords (supports weights)
    function findKnotSpan(u: number, knots: number[], degree: number) {
      const m = knots.length - 1;
      const n = m - degree - 1;
      if (u >= knots[n + 1]) return n;
      if (u <= knots[degree]) return degree;
      // find span
      for (let i = degree; i <= n; i++) {
        if (u >= knots[i] && u < knots[i + 1]) return i;
      }
      return degree;
    }

    function deBoor(u: number, degree: number, knots: number[], ctrlPts: {x:number,y:number, w?:number}[]) {
      // convert to homogeneous coords
      const pts = ctrlPts.map(p => [p.w ?? 1 * p.x, p.w ?? 1 * p.y, p.w ?? 1]);
      const k = findKnotSpan(u, knots, degree);
      const d: number[][] = [];
      for (let j = 0; j <= degree; j++) {
        const idx = k - degree + j;
        const p = pts[idx];
        d[j] = [p[0], p[1], p[2]]; // clone
      }
      for (let r = 1; r <= degree; r++) {
        for (let j = degree; j >= r; j--) {
          const i = k - degree + j;
          const denom = knots[i + degree - r + 1] - knots[i];
          let alpha = 0;
          if (denom !== 0) alpha = (u - knots[i]) / denom;
          d[j][0] = (1 - alpha) * d[j - 1][0] + alpha * d[j][0];
          d[j][1] = (1 - alpha) * d[j - 1][1] + alpha * d[j][1];
          d[j][2] = (1 - alpha) * d[j - 1][2] + alpha * d[j][2];
        }
      }
      const H = d[degree];
      if (H[2] === 0) return { x: H[0], y: H[1] };
      return { x: H[0] / H[2], y: H[1] / H[2] };
    }

    function evalSplineAt(u: number, spline: { degree:number, ctrlPts:{x:number,y:number}[], knots:number[], weights?: number[] }) {
      const { degree, ctrlPts, knots, weights } = spline;
      if (!knots || knots.length === 0) {
        // fallback: simple linear interpolation over ctrl points
        const t = Math.max(0, Math.min(1, u));
        const idx = Math.floor(t * (ctrlPts.length - 1));
        const a = ctrlPts[idx];
        const b = ctrlPts[Math.min(ctrlPts.length - 1, idx + 1)];
        const local = (t * (ctrlPts.length - 1)) - idx;
        return { x: a.x * (1 - local) + b.x * local, y: a.y * (1 - local) + b.y * local };
      }
      const cpWithW = ctrlPts.map((p, i) => ({ x: p.x, y: p.y, w: weights && weights[i] ? weights[i] : 1 }));
      return deBoor(u, degree, knots, cpWithW);
    }

    function approxDerivative(u:number, spline:any, du = 1e-4) {
      const knots = spline.knots;
      const umin = knots[spline.degree];
      const umax = knots[knots.length - spline.degree - 1];
      const h = Math.min(du * (umax - umin), 1e-3);
      const u0 = Math.max(umin, u - h);
      const u1 = Math.min(umax, u + h);
      const p0 = evalSplineAt(u0, spline);
      const p1 = evalSplineAt(u1, spline);
      return { x: (p1.x - p0.x) / (u1 - u0), y: (p1.y - p0.y) / (u1 - u0) };
    }

    // adaptive bezier approximation for a single parameter interval [u0,u1]
    function fitBezierOnInterval(spline:any, u0:number, u1:number, tol:number, preserveParams:Set<number>) {
      const p0 = evalSplineAt(u0, spline);
      const p3 = evalSplineAt(u1, spline);
      const d0 = approxDerivative(u0, spline);
      const d1 = approxDerivative(u1, spline);
      const du = u1 - u0;
      // heuristic control points
      const p1 = { x: p0.x + (d0.x * du) / 3, y: p0.y + (d0.y * du) / 3 };
      const p2 = { x: p3.x - (d1.x * du) / 3, y: p3.y - (d1.y * du) / 3 };

      // error test by sampling
      let maxErr = 0;
      let maxT = 0;
      const samples = 8;
      for (let i = 1; i < samples; i++) {
        const t = i / samples;
        const u = u0 + t * du;
        const s = evalSplineAt(u, spline);
        // evaluate bezier at t
        const bt = (1 - t) * (1 - t) * (1 - t);
        const b1t = 3 * (1 - t) * (1 - t) * t;
        const b2t = 3 * (1 - t) * t * t;
        const b3t = t * t * t;
        const bx = p0.x * bt + p1.x * b1t + p2.x * b2t + p3.x * b3t;
        const by = p0.y * bt + p1.y * b1t + p2.y * b2t + p3.y * b3t;
        const err = Math.hypot(s.x - bx, s.y - by);
        if (err > maxErr) { maxErr = err; maxT = t; }
      }

      // if preserve param inside interval -> subdivide
      for (const v of Array.from(preserveParams)) {
        if (v > u0 + 1e-12 && v < u1 - 1e-12) {
          const mid = (u0 + u1) / 2;
          return [...fitBezierOnInterval(spline, u0, mid, tol, preserveParams), ...fitBezierOnInterval(spline, mid, u1, tol, preserveParams)];
        }
      }

      if (maxErr <= tol) {
        return [{ p0, p1, p2, p3, u0, u1 }];
      }

      // subdivide
      const mid = (u0 + u1) / 2;
      return [...fitBezierOnInterval(spline, u0, mid, tol, preserveParams), ...fitBezierOnInterval(spline, mid, u1, tol, preserveParams)];
    }

    function approximateSplineToBeziers(spline:any, tol:number, seamParams:Set<number>) {
      const knots = spline.knots;
      const degree = spline.degree;
      if (!knots || knots.length === 0) {
        // fallback: treat ctrlPts as polyline
        const pts = spline.ctrlPts;
        const res: any[] = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p3 = pts[i + 1];
          const p1 = { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 };
          const p2 = { x: p3.x - (p3.x - p0.x) / 3, y: p3.y - (p3.y - p0.y) / 3 };
          res.push({ p0, p1, p2, p3, u0: i / (pts.length - 1), u1: (i + 1) / (pts.length - 1) });
        }
        return res;
      }

      const umin = knots[degree];
      const umax = knots[knots.length - degree - 1];

      const segments: any[] = [];
      // split by knot spans
      for (let iK = degree; iK < knots.length - degree - 1; iK++) {
        const u0 = knots[iK];
        const u1 = knots[iK + 1];
        if (u1 - u0 <= 1e-12) continue;
        const segs = fitBezierOnInterval(spline, u0, u1, tol, seamParams);
        for (const s of segs) segments.push(s);
      }

      return segments;
    }

    // For polylines: attempt to approximate as cubic Bezier segments (preserve seams),
    // falling back to RDP simplification when Bezier fit is not effective.
    function buildPolylineSampler(vertices: {x:number,y:number}[]) {
      const n = vertices.length;
      const segLen: number[] = [];
      let total = 0;
      for (let i = 0; i < n - 1; i++) {
        const dx = vertices[i+1].x - vertices[i].x;
        const dy = vertices[i+1].y - vertices[i].y;
        const l = Math.hypot(dx, dy);
        segLen.push(l);
        total += l;
      }
      const accum: number[] = [0];
      for (let i = 0; i < segLen.length; i++) accum.push(accum[i] + segLen[i]);

      function evalAt(t:number) {
        if (t <= 0) return vertices[0];
        if (t >= 1) return vertices[n-1];
        const d = t * total;
        // find segment
        let idx = 0;
        while (idx < segLen.length && accum[idx+1] < d) idx++;
        const segStart = accum[idx];
        const segL = segLen[idx] || 1;
        const local = (d - segStart) / segL;
        const a = vertices[idx];
        const b = vertices[idx+1];
        return { x: a.x * (1 - local) + b.x * local, y: a.y * (1 - local) + b.y * local };
      }

      function derivativeAt(t:number, h = 1e-4) {
        const t0 = Math.max(0, t - h);
        const t1 = Math.min(1, t + h);
        const p0 = evalAt(t0);
        const p1 = evalAt(t1);
        return { x: (p1.x - p0.x) / (t1 - t0), y: (p1.y - p0.y) / (t1 - t0) };
      }

      return { evalAt, derivativeAt };
    }

    function approximatePolylineToBeziers(vertices:{x:number,y:number}[], tol:number, preserveIndices:Set<number>, closed:boolean) {
      if (vertices.length < 2) return [];
      const sampler = buildPolylineSampler(vertices);
      // convert preserveIndices to parameter values
      const n = vertices.length;
      const lengths: number[] = [0];
      for (let i = 0; i < n - 1; i++) lengths.push(lengths[i] + Math.hypot(vertices[i+1].x - vertices[i].x, vertices[i+1].y - vertices[i].y));
      const total = lengths[lengths.length -1] || 1;
      const preserveParams = new Set<number>();
      for (const idx of Array.from(preserveIndices)) {
        if (idx >= 0 && idx < n) {
          preserveParams.add(lengths[idx] / total);
        }
      }

      // adaptive fit similar to spline fitting
      function fitInterval(u0:number,u1:number) {
        const p0 = sampler.evalAt(u0);
        const p3 = sampler.evalAt(u1);
        const d0 = sampler.derivativeAt(u0);
        const d1 = sampler.derivativeAt(u1);
        const du = u1 - u0;
        const p1 = { x: p0.x + (d0.x * du) / 3, y: p0.y + (d0.y * du) / 3 };
        const p2 = { x: p3.x - (d1.x * du) / 3, y: p3.y - (d1.y * du) / 3 };
        // error sampling
        let maxErr = 0; let samples = 8;
        for (let i = 1; i < samples; i++) {
          const t = i / samples;
          const u = u0 + t * du;
          const s = sampler.evalAt(u);
          const bt = (1 - t) * (1 - t) * (1 - t);
          const b1t = 3 * (1 - t) * (1 - t) * t;
          const b2t = 3 * (1 - t) * t * t;
          const b3t = t * t * t;
          const bx = p0.x * bt + p1.x * b1t + p2.x * b2t + p3.x * b3t;
          const by = p0.y * bt + p1.y * b1t + p2.y * b2t + p3.y * b3t;
          const err = Math.hypot(s.x - bx, s.y - by);
          if (err > maxErr) maxErr = err;
        }
        // preserve param splitting
        for (const v of Array.from(preserveParams)) {
          if (v > u0 + 1e-12 && v < u1 - 1e-12) {
            const mid = (u0 + u1) / 2;
            return [...fitInterval(u0, mid), ...fitInterval(mid, u1)];
          }
        }
        if (maxErr <= tol) return [{ p0,p1,p2,p3,u0,u1 }];
        const mid = (u0 + u1) / 2;
        return [...fitInterval(u0, mid), ...fitInterval(mid, u1)];
      }

      // run across [0,1] but split at preserveParams
      const params = Array.from(preserveParams).concat([0,1]).sort((a,b)=>a-b);
      const segs:any[] = [];
      for (let i=0;i<params.length-1;i++) {
        const s = params[i]; const e = params[i+1];
        if (e - s < 1e-12) continue;
        const part = fitInterval(s,e);
        segs.push(...part);
      }
      return segs;
    }

    for (const poly of polylines) {
      if ((poly as any).spline) continue;
      if (!poly.vertices || poly.vertices.length <= 2) continue;
      const n = poly.vertices.length;
      const mustKeep = new Set<number>();
      mustKeep.add(0);
      mustKeep.add(n - 1);
      for (const s of seamLines) {
        for (let vi = 0; vi < n; vi++) {
          const v = poly.vertices[vi];
          const d1 = Math.hypot(v.x - s.x1, v.y - s.y1);
          const d2 = Math.hypot(v.x - s.x2, v.y - s.y2);
          if (d1 <= Math.max(2, simplifyTolerance * 2) || d2 <= Math.max(2, simplifyTolerance * 2)) mustKeep.add(vi);
        }
      }

      // try bezier fitting
      const bezs = approximatePolylineToBeziers(poly.vertices, simplifyTolerance, mustKeep, poly.closed);
      // if bezier fitting produced fewer total points than original, use it; otherwise fall back to simplify
      const ptsCount = bezs.length * 2 + 1; // approx points for bez segments
      if (bezs.length > 0 && ptsCount < poly.vertices.length) {
        (poly as any).bezierSegments = bezs;
      } else {
        const simplified = simplifyWithPreserve(poly.vertices, simplifyTolerance, mustKeep, poly.closed);
        if (simplified.length >= 2) poly.vertices = simplified;
      }
    }

    // Convert polylines and splines into paths
    const newPaths: any[] = [];

    for (const poly of polylines) {
      if ((poly as any).spline) {
        const s = (poly as any).spline as { degree:number, ctrlPts:{x:number,y:number}[], knots:number[], weights?: number[], closed?: boolean };
        // detect seam parameters to preserve
        const seamParams = new Set<number>();
        if (seamLines.length > 0 && s.knots && s.knots.length > 0) {
          // sample many points on spline and locate nearest parameter to each seam endpoint
          const sampleCount = 200;
          const umin = s.knots[s.degree];
          const umax = s.knots[s.knots.length - s.degree - 1];
          const sampled: {u:number,p:{x:number,y:number}}[] = [];
          for (let i = 0; i <= sampleCount; i++) {
            const u = umin + (i / sampleCount) * (umax - umin);
            sampled.push({ u, p: evalSplineAt(u, s) });
          }

          for (const seam of seamLines) {
            const targets = [ { x: seam.x1, y: seam.y1 }, { x: seam.x2, y: seam.y2 } ];
            for (const t of targets) {
              let best = { idx: 0, d: Infinity };
              for (let i = 0; i < sampled.length; i++) {
                const d = Math.hypot(sampled[i].p.x - t.x, sampled[i].p.y - t.y);
                if (d < best.d) { best = { idx: i, d }; }
              }
              // refine around best by binary search like refinement
              let lo = Math.max(0, best.idx - 2);
              let hi = Math.min(sampled.length - 1, best.idx + 2);
              let bestU = sampled[best.idx].u;
              let bestD = best.d;
              for (let r = 0; r < 8; r++) {
                let improved = false;
                for (let k = lo; k <= hi; k++) {
                  const u = sampled[k].u;
                  const p = evalSplineAt(u, s);
                  const d = Math.hypot(p.x - t.x, p.y - t.y);
                  if (d < bestD) { bestD = d; bestU = u; improved = true; }
                }
                if (!improved) break;
                lo = Math.max(0, best.idx - 3);
                hi = Math.min(sampled.length - 1, best.idx + 3);
              }
              // only include parameter if reasonably close (< 10 editor units)
              if (bestD <= Math.max(10, simplifyTolerance * 4)) seamParams.add(bestU);
            }
          }
        }

        // approximate spline to beziers using simplifyTolerance
        const segments = approximateSplineToBeziers(s, simplifyTolerance, seamParams);
        if (segments.length === 0) continue;

        // convert bezier segments into path points (points are endpoints, handles represent bezier control points)
        const points: any[] = [];
        // first segment p0 is start
        const first = segments[0];
        const p0 = first.p0;
        points.push({ id: crypto.randomUUID(), x: p0.x, y: p0.y, handleIn: { dx: 0, dy: 0 }, handleOut: { dx: first.p1.x - p0.x, dy: first.p1.y - p0.y } });
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const p3 = seg.p3;
          const handleIn = { dx: seg.p2.x - p3.x, dy: seg.p2.y - p3.y };
          const handleOut = { dx: 0, dy: 0 };
          points.push({ id: crypto.randomUUID(), x: p3.x, y: p3.y, handleIn, handleOut });
          // also set previous point's handleOut if not set
          if (i > 0) {
            const prev = points[points.length - 2];
            prev.handleOut = { dx: segments[i].p1.x - prev.x, dy: segments[i].p1.y - prev.y };
          }
        }

        newPaths.push({ id: crypto.randomUUID(), closed: !!poly.closed, points, texture: null });
      } else if ((poly as any).bezierSegments) {
        // poly contains explicit bezier segments (from LWPOLYLINE bulge, ARC, or ELLIPSE conversion)
        const segs = (poly as any).bezierSegments as any[];
        if (segs.length === 0) continue;
        const points: any[] = [];
        const first = segs[0];
        const p0 = first.p0;
        points.push({ id: crypto.randomUUID(), x: p0.x, y: p0.y, handleIn: { dx: 0, dy: 0 }, handleOut: { dx: first.p1.x - p0.x, dy: first.p1.y - p0.y } });
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i];
          const p3 = seg.p3;
          const handleIn = { dx: seg.p2.x - p3.x, dy: seg.p2.y - p3.y };
          const handleOut = { dx: 0, dy: 0 };
          points.push({ id: crypto.randomUUID(), x: p3.x, y: p3.y, handleIn, handleOut });
          if (i > 0) {
            const prev = points[points.length - 2];
            prev.handleOut = { dx: segs[i].p1.x - prev.x, dy: segs[i].p1.y - prev.y };
          }
        }
        const match = /^PATTERN_(.+)_(front|back)$/.exec(poly.layer);
        const id = match ? match[1] : crypto.randomUUID();
        newPaths.push({ id, closed: !!poly.closed, points, texture: null });
      } else {
        // normal polyline
        const match = /^PATTERN_(.+)_(front|back)$/.exec(poly.layer);
        const id = match ? match[1] : crypto.randomUUID();
        const closed = poly.closed;
        const points = poly.vertices.map((v) => ({
          id: crypto.randomUUID(),
          x: v.x,
          y: v.y,
          handleIn: { dx: 0, dy: 0 },
          handleOut: { dx: 0, dy: 0 },
        }));

        newPaths.push({ id, closed, points, texture: null });
      }
    }

    // Build spatial index of points to match seams (simple nearest-neighbour)
    const flatPoints: { id: string; x:number; y:number }[] = [];
    for (const p of newPaths) for (const pt of p.points) flatPoints.push({ id: pt.id, x: pt.x, y: pt.y });

    function nearestPoint(x:number,y:number, maxDist = 10) {
      // maxDist is in editor units; it's fine now because we already scaled seamLines into editor units
      let best: { id:string; x:number; y:number } | null = null;
      let bestDist = Infinity;
      for (const pt of flatPoints) {
        const dx = pt.x - x; const dy = pt.y - y; const d = Math.sqrt(dx*dx+dy*dy);
        if (d < bestDist) { bestDist = d; best = pt; }
      }
      return bestDist <= maxDist && best ? best : null;
    }

    const newSeams: [[string,string],[string,string]][] = [];

    for (const s of seamLines) {
      const a = nearestPoint(s.x1, s.y1, 10);
      const b = nearestPoint(s.x2, s.y2, 10);
      if (a && b) {
        // Create seam connecting those two points (we'll use each point as a simple segment edge)
        newSeams.push([[a.id, a.id], [b.id, b.id]]);
      }
    }
    // Commit to state
    useCanvasState.setState((prev) => ({
      present: {
        ...prev.present,
        paths: [...prev.present.paths, ...newPaths],
        seams: [...prev.present.seams, ...newSeams],
      },
    }));
  };

  reader.readAsText(file);
}
