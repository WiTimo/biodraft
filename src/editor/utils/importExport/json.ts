import { useCanvasState } from '../../state/CanvasState';
import type { Path } from '../../state/types';
import {
  getFrontBackSplitX,
  computeHumanBounds,
  groupPathsIntoPatterns,
  inferPatternSideFromPath,
  getSideOrigin,
  seamPartToSegment,
  type PatternSide,
  type SharedPointGroup,
} from './shared';

/**
 * Clean up empty paths from the canvas state.
 * This removes any paths that have no points.
 */
export function cleanupEmptyPaths() {
  const state = useCanvasState.getState();
  const validPaths = state.present.paths.filter((path) => path.points.length > 0);

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

function filterEmptyPaths(paths: Path[]) {
  return paths.filter((path) => path.points.length > 0);
}

export function exportToJson() {
  const state = useCanvasState.getState();
  const { paths, seams, backgroundImages } = state.present;
  const { manImageCenters } = state;

  const splitX = getFrontBackSplitX({ manImageCenters, backgroundImages });
  const human_bounds = computeHumanBounds(backgroundImages);

  // Filter out empty paths (paths with no points)
  const validPaths = filterEmptyPaths(paths);

  if (validPaths.length === 0) {
    alert('No patterns to export. Please create at least one pattern with points.');
    return;
  }

  if (validPaths.length !== paths.length) {
    console.log(`Note: Skipping ${paths.length - validPaths.length} empty path(s) during export`);
  }

  // Build set of valid point IDs from remaining paths
  const validPointIds = new Set<string>();
  validPaths.forEach((path) => {
    path.points.forEach((point) => validPointIds.add(point.id));
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
  sharedPoints.forEach((group) => {
    group.instances.forEach((instance) => {
      const key = `${instance.pathId}-${instance.pointIndex}`;
      sharedPointMap.set(key, group);
    });
  });

  const exportData = validPaths.map((path) => {
    const side = inferPatternSideFromPath(path, splitX);
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
        ...(sharedGroup
          ? {
              shared: true,
              sharedWithPatterns: sharedGroup.pathIds.filter((id) => id !== path.id),
            }
          : {}),
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

  if (!human_bounds) {
    console.warn('human_bounds could not be computed (missing nativeWidth/nativeHeight on man images).');
  }

  const blob = new Blob(
    [
      JSON.stringify(
        {
          human_bounds,
          patterns: exportData,
          seams: validSeams,
          sharedPoints: sharedPoints.length,
        },
        null,
        2
      ),
    ],
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
