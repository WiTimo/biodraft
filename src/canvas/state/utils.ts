import type { CanvasPresent, Point, Segment, SegmentSeam } from './types';

export const INITIAL_PRESENT: CanvasPresent = {
  paths: [],
  backgroundImages: [],
  seams: [],
};

export function clonePresent(present: CanvasPresent): CanvasPresent {
  return JSON.parse(JSON.stringify(present));
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
  const sameDirection = segmentsEqual(segA1, segB1) && segmentsEqual(segA2, segB2);
  const swappedDirection = segmentsEqual(segA1, segB2) && segmentsEqual(segA2, segB1);
  return sameDirection || swappedDirection;
}
