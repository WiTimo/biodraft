import type { CanvasPresent, Point, Segment, SegmentSeam } from './types';

export const INITIAL_PRESENT: CanvasPresent = {
  paths: [],
  backgroundImages: [],
  seams: [],
};

export function clonePresent(present: CanvasPresent): CanvasPresent {
  // Prefer native structured cloning (faster, less GC churn) with a safe fallback.
  // CanvasPresent is plain JSON-serializable data.
  try {
    const sc = globalThis.structuredClone;
    if (typeof sc === 'function') return sc(present);
  } catch {
    // ignore
  }
  return JSON.parse(JSON.stringify(present)) as CanvasPresent;
}

export function updatePointInPath(
  paths: CanvasPresent['paths'],
  pointId: string,
  update: (point: Point) => Point,
) {
  return paths.map((path) => {
    if (!path.points.some((pt) => pt.id === pointId)) return path;
    return {
      ...path,
      points: path.points.map((pt) => (pt.id === pointId ? update(pt) : pt)),
    };
  });
}

export function normalizeSegment([a, b]: Segment): Segment {
  return [a, b].sort() as Segment;
}

export function segmentsEqual(s1: Segment, s2: Segment): boolean {
  const [a1, b1] = normalizeSegment(s1);
  const [a2, b2] = normalizeSegment(s2);
  return a1 === a2 && b1 === b2;
}

export function seamsEqual([segA1, segA2]: SegmentSeam, [segB1, segB2]: SegmentSeam): boolean {
  const getSegment = (seg: any) => seg.segment || seg;
  const seg1 = getSegment(segA1);
  const seg2 = getSegment(segA2);
  const seg3 = getSegment(segB1);
  const seg4 = getSegment(segB2);
  
  const sameDirection = segmentsEqual(seg1, seg3) && segmentsEqual(seg2, seg4);
  const swappedDirection = segmentsEqual(seg1, seg4) && segmentsEqual(seg2, seg3);
  return sameDirection || swappedDirection;
}

/**
 * Cubic Bezier curve evaluation at parameter t (0-1)
 */
export function evaluateBezier(
  p0: Pick<Point, 'x' | 'y'>,
  h0: { dx: number; dy: number },
  h1: { dx: number; dy: number },
  p1: Pick<Point, 'x' | 'y'>,
  t: number
): { x: number; y: number } {
  const x = Math.pow(1 - t, 3) * p0.x +
    3 * Math.pow(1 - t, 2) * t * (p0.x + h0.dx) +
    3 * (1 - t) * Math.pow(t, 2) * (p1.x + h1.dx) +
    Math.pow(t, 3) * p1.x;
  const y = Math.pow(1 - t, 3) * p0.y +
    3 * Math.pow(1 - t, 2) * t * (p0.y + h0.dy) +
    3 * (1 - t) * Math.pow(t, 2) * (p1.y + h1.dy) +
    Math.pow(t, 3) * p1.y;
  return { x, y };
}

/**
 * Generate points along a cubic Bezier curve
 */
export function generateBezierPoints(
  p0: Pick<Point, 'x' | 'y'>,
  h0: { dx: number; dy: number },
  h1: { dx: number; dy: number },
  p1: Pick<Point, 'x' | 'y'>,
  steps = 80
): number[] {
  const points: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { x, y } = evaluateBezier(p0, h0, h1, p1, t);
    points.push(x, y);
  }
  return points;
}

/**
 * Filter out seams that reference any of the deleted point IDs
 * More efficient than rebuilding the entire point set
 */
export function filterSeamsReferencingPoints(seams: SegmentSeam[], deletedPointIds: Set<string>): SegmentSeam[] {
  return seams.filter((seam) => {
    const portion1 = seam[0] as any;
    const portion2 = seam[1] as any;
    
    // Handle both SegmentPortion and Segment types
    const seg1 = portion1.segment || portion1;
    const seg2 = portion2.segment || portion2;
    
    const [p1, p2] = seg1;
    const [p3, p4] = seg2;
    
    // Keep seam only if NONE of its points were deleted
    return !(deletedPointIds.has(p1) || 
             deletedPointIds.has(p2) || 
             deletedPointIds.has(p3) || 
             deletedPointIds.has(p4));
  });
}
