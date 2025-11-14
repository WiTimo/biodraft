import { useCanvasState } from '../state/CanvasState';
import type { Path, Point } from '../state/types';

// Tolerance for considering two points as overlapping (in pixels)
const POINT_OVERLAP_TOLERANCE = 5;

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
  const { paths, seams } = useCanvasState.getState().present;

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
  const validSeams = seams.filter(([[p1, p2], [p3, p4]]) => {
    return validPointIds.has(p1) && validPointIds.has(p2) && 
           validPointIds.has(p3) && validPointIds.has(p4);
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
    const exportedPoints = path.points.map((p, pointIndex) => {
      const key = `${path.id}-${pointIndex}`;
      const sharedGroup = sharedPointMap.get(key);
      
      return {
        id: p.id,
        x: p.x,
        y: p.y,
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
      points: exportedPoints,
      closed: path.closed,
      texture: path.texture
        ? {
            src: path.texture.src,
            scaleX: path.texture.scaleX ?? 1,
            scaleY: path.texture.scaleY ?? 1,
            offsetX: path.texture.offsetX ?? 0,
            offsetY: path.texture.offsetY ?? 0,
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

    const newPaths = parsed.patterns.map((pattern: any) => ({
      id: pattern.id,
      closed: pattern.closed,
      points: pattern.points.map((p: any) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        handleIn: { dx: p.handleIn.dx, dy: p.handleIn.dy },
        handleOut: { dx: p.handleOut.dx, dy: p.handleOut.dy },
        seamRespectMm: typeof p.seamRespectMm === 'number' ? p.seamRespectMm : undefined,
      })),
      texture: pattern.texture
        ? {
            src: pattern.texture.src,
            scaleX: pattern.texture.scaleX ?? 1,
            scaleY: pattern.texture.scaleY ?? 1,
            offsetX: pattern.texture.offsetX ?? 0,
            offsetY: pattern.texture.offsetY ?? 0,
            rotation: pattern.texture.rotation ?? 0,
            repeat: pattern.texture.repeat ?? 'repeat',
          }
        : null,
    }));

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
