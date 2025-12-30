import type { BackgroundImage, Path, Point, Segment, SegmentPortion } from '../../state/types';

// Tolerance for considering two points as overlapping (in pixels)
export const POINT_OVERLAP_TOLERANCE = 5;

// Canvas split line between front/back drawing areas.
// Export normalizes coordinates so each side has a consistent local origin.
// We prefer deriving the split from the actual front/back man-image placement,
// because the editor can be responsive and the split isn't always a hardcoded value.
const FRONT_BACK_SPLIT_X_FALLBACK = 700;

export const FRONT_IMAGE_ID = 'static-man';
export const BACK_IMAGE_ID = 'static-man-back';

export type PatternSide = 'front' | 'back';

export type HumanBounds = {
  width: number;
  height: number;
  front?: { width: number; height: number };
  back?: { width: number; height: number };
};

export function getScaledImageSize(
  img: BackgroundImage | undefined | null
): { width: number; height: number } | null {
  if (!img) return null;
  if (typeof img.nativeWidth !== 'number' || typeof img.nativeHeight !== 'number') return null;
  return { width: img.nativeWidth * img.scaleX, height: img.nativeHeight * img.scaleY };
}

export function computeHumanBounds(backgroundImages: BackgroundImage[]): HumanBounds | null {
  const front = backgroundImages.find((b) => b.id === FRONT_IMAGE_ID);
  const back = backgroundImages.find((b) => b.id === BACK_IMAGE_ID);

  const frontSize = getScaledImageSize(front);
  const backSize = getScaledImageSize(back);

  const widths = [frontSize?.width, backSize?.width].filter((v): v is number => typeof v === 'number');
  const heights = [frontSize?.height, backSize?.height].filter((v): v is number => typeof v === 'number');
  if (widths.length === 0 || heights.length === 0) return null;

  return {
    width: Math.max(...widths),
    height: Math.max(...heights),
    ...(frontSize ? { front: frontSize } : {}),
    ...(backSize ? { back: backSize } : {}),
  };
}

export function getBackgroundCenter(backgroundImages: BackgroundImage[], id: string): { x: number; y: number } | null {
  const img = backgroundImages.find((b) => b.id === id);
  if (!img) return null;
  if (typeof img.nativeWidth !== 'number' || typeof img.nativeHeight !== 'number') return null;
  return {
    x: img.x + (img.nativeWidth * img.scaleX) / 2,
    y: img.y + (img.nativeHeight * img.scaleY) / 2,
  };
}

export function getFrontBackSplitX(opts: {
  manImageCenters: Record<string, { x: number; y: number }>;
  backgroundImages: BackgroundImage[];
}): number {
  const frontCenter = opts.manImageCenters[FRONT_IMAGE_ID] ?? getBackgroundCenter(opts.backgroundImages, FRONT_IMAGE_ID);
  const backCenter = opts.manImageCenters[BACK_IMAGE_ID] ?? getBackgroundCenter(opts.backgroundImages, BACK_IMAGE_ID);
  if (frontCenter && backCenter) return (frontCenter.x + backCenter.x) / 2;
  return FRONT_BACK_SPLIT_X_FALLBACK;
}

export function getSideOrigin(
  side: PatternSide,
  opts: { manImageCenters: Record<string, { x: number; y: number }>; backgroundImages: BackgroundImage[] }
): { x: number; y: number } {
  const id = side === 'front' ? FRONT_IMAGE_ID : BACK_IMAGE_ID;
  const center = opts.manImageCenters[id] ?? getBackgroundCenter(opts.backgroundImages, id);
  if (center) return center;

  // Fallback to previous behavior (back normalized by split line; front unchanged)
  return { x: side === 'back' ? getFrontBackSplitX(opts) : 0, y: 0 };
}

export function inferPatternSideFromPath(path: Path, splitX: number): PatternSide {
  if (path.points.length === 0) return 'front';

  const meanX = path.points.reduce((sum, p) => sum + p.x, 0) / path.points.length;
  return meanX < splitX ? 'front' : 'back';
}

export function seamPartToSegment(part: Segment | SegmentPortion): Segment {
  return Array.isArray(part) ? part : part.segment;
}

export interface PointWithPath {
  point: Point;
  pathId: string;
  pathIndex: number;
  pointIndex: number;
}

export interface SharedPointGroup {
  canonicalPoint: Point;
  pathIds: string[];
  instances: PointWithPath[];
}

/**
 * Check if two points are close enough to be considered overlapping.
 */
export function arePointsOverlapping(p1: Point, p2: Point, tolerance = POINT_OVERLAP_TOLERANCE): boolean {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy) <= tolerance;
}

/**
 * Find all groups of overlapping points across all paths.
 */
export function findSharedPoints(paths: Path[]): SharedPointGroup[] {
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
    const uniquePathIds = new Set(group.map((p) => p.pathId));
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
 * Group paths into patterns based on shared points.
 *
 * Note: Currently this keeps each path as a separate "pattern" but annotates shared points.
 */
export function groupPathsIntoPatterns(paths: Path[]): { patternGroups: Path[][]; sharedPoints: SharedPointGroup[] } {
  const sharedPoints = findSharedPoints(paths);

  // For now, we keep each path as a separate pattern, but we'll export shared points in both
  // In the future, you might want to merge paths that are actually the same pattern
  const patternGroups = paths.map((path) => [path]);

  return { patternGroups, sharedPoints };
}
