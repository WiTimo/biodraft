import type { CanvasStateCreator, PointSlice } from '../types';
import { updatePointInPath, filterSeamsReferencingPoints } from '../utils';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeNormalize(dx: number, dy: number) {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(len) || len <= 1e-9) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

function computeSpawnHandlesForPoint(paths: Array<{ points: Array<{ id: string; x: number; y: number }>; closed: boolean }>, pointId: string) {
  // Handle length should be relative to the local geometry, not a fixed world-unit value.
  // We pick the smallest adjacent-segment length across all occurrences of the point.
  const MIN_HANDLE_LEN = 2; // world units
  const MAX_HANDLE_LEN = 50; // world units
  const HANDLE_LEN_FACTOR = 0.35;

  let bestDist = Number.POSITIVE_INFINITY;
  let bestDir = { x: 1, y: 0 };

  for (const path of paths) {
    const pts = path.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.id !== pointId) continue;

      const prev = i > 0 ? pts[i - 1] : path.closed && pts.length > 1 ? pts[pts.length - 1] : null;
      const next = i < pts.length - 1 ? pts[i + 1] : path.closed && pts.length > 1 ? pts[0] : null;

      const distPrev = prev ? Math.hypot(p.x - prev.x, p.y - prev.y) : Number.POSITIVE_INFINITY;
      const distNext = next ? Math.hypot(next.x - p.x, next.y - p.y) : Number.POSITIVE_INFINITY;
      const localDist = Math.min(distPrev, distNext);

      // Direction: prefer the chord direction (prev->next) when possible.
      let dir = { x: 1, y: 0 };
      if (prev && next && (prev.x !== next.x || prev.y !== next.y)) {
        dir = safeNormalize(next.x - prev.x, next.y - prev.y);
      } else if (prev) {
        dir = safeNormalize(p.x - prev.x, p.y - prev.y);
      } else if (next) {
        dir = safeNormalize(next.x - p.x, next.y - p.y);
      }

      // Pick the smallest local segment so handles never spawn overly large.
      if (Number.isFinite(localDist) && localDist > 1e-6 && localDist < bestDist) {
        bestDist = localDist;
        bestDir = dir;
      }
    }
  }

  const computedLen = Number.isFinite(bestDist) ? bestDist * HANDLE_LEN_FACTOR : 10;
  const len = clamp(computedLen, MIN_HANDLE_LEN, MAX_HANDLE_LEN);

  return {
    handleIn: { dx: -bestDir.x * len, dy: -bestDir.y * len },
    handleOut: { dx: bestDir.x * len, dy: bestDir.y * len },
  };
}

export const createPointSlice: CanvasStateCreator<PointSlice> = (set, get, _api) => ({
  justPlacedPointId: null,
  isDraggingHandle: false,

  addPoint: (x, y, sharp = false) => {
    const { present, saveState, currentPathId } = get();
    
    const tolerance = 1; // 1 pixel tolerance for overlapping points
    
    // Check if we're adding a point at the exact same location as an existing point in ANY path
    let existingPoint: typeof present.paths[0]['points'][0] | null = null;
    
    for (const path of present.paths) {
      for (const point of path.points) {
        const dx = point.x - x;
        const dy = point.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < tolerance) {
          existingPoint = point;
          break;
        }
      }
      if (existingPoint) break;
    }
    
    // If we found an overlapping point, reuse it (creating a shared point)
    if (existingPoint) {
      if (currentPathId) {
        const currentPath = present.paths.find(p => p.id === currentPathId);

        // If currentPathId points to a path that no longer exists (e.g., after an undo),
        // create a new path instead of trying to append to a missing one.
        if (!currentPath) {
          saveState();
          const newPathId = crypto.randomUUID();
          set({
            present: {
              ...present,
              paths: [
                ...present.paths,
                { id: newPathId, points: [existingPoint], closed: false, texture: null },
              ],
            },
            currentPathId: newPathId,
            justPlacedPointId: existingPoint.id,
          });

          return existingPoint.id;
        }

        // Don't add the same point twice to the same path
        if (currentPath.points.some(p => p.id === existingPoint.id)) {
          return existingPoint.id;
        }

        saveState();

        // Add the existing point to the current path (creating a shared point reference)
        set({
          present: {
            ...present,
            paths: present.paths.map((path) =>
              path.id === currentPathId
                ? { ...path, points: [...path.points, existingPoint] }
                : path,
            ),
          },
          justPlacedPointId: existingPoint.id,
        });

        return existingPoint.id;
      } else {
        // Starting a new path with an existing point (shared point)
        saveState();

        const newPathId = crypto.randomUUID();
        set({
          present: {
            ...present,
            paths: [
              ...present.paths,
              { id: newPathId, points: [existingPoint], closed: false, texture: null },
            ],
          },
          currentPathId: newPathId,
          justPlacedPointId: existingPoint.id,
        });

        return existingPoint.id;
      }
    }
    
    saveState();

    // Create a new point
    const point = {
      id: crypto.randomUUID(),
      x,
      y,
      handleIn: sharp ? { dx: 0, dy: 0 } : { dx: -30, dy: 0 },
      handleOut: sharp ? { dx: 0, dy: 0 } : { dx: 30, dy: 0 },
    };

    if (currentPathId) {
      const currentPath = present.paths.find(p => p.id === currentPathId);
      if (currentPath) {
        set({
          present: {
            ...present,
            paths: present.paths.map((path) =>
              path.id === currentPathId
                ? { ...path, points: [...path.points, point] }
                : path,
            ),
          },
          justPlacedPointId: point.id,
        });
      } else {
        // currentPathId is stale (path was removed by an undo); create a new path
        const newPathId = crypto.randomUUID();
        set({
          present: {
            ...present,
            paths: [
              ...present.paths,
              { id: newPathId, points: [point], closed: false, texture: null },
            ],
          },
          currentPathId: newPathId,
          justPlacedPointId: point.id,
        });
      }
    } else {
      const newPathId = crypto.randomUUID();
      set({
        present: {
          ...present,
          paths: [
            ...present.paths,
            { id: newPathId, points: [point], closed: false, texture: null },
          ],
        },
        currentPathId: newPathId,
        justPlacedPointId: point.id,
      });
    }

    return point.id;
  },

  finishCurrentPath: () => {
    const { present, currentPathId, saveState } = get();
    if (!currentPathId) return;

    const currentPath = present.paths.find(p => p.id === currentPathId);
    if (!currentPath) return;

    // If path has fewer than 2 points, remove it instead of finishing it
    if (currentPath.points.length < 2) {
      const updatedPaths = present.paths.filter(p => p.id !== currentPathId);
      // Collect all point IDs from the removed path
      const deletedPointIds = new Set(currentPath.points.map(p => p.id));
      const updatedSeams = filterSeamsReferencingPoints(present.seams, deletedPointIds);
      
      set({
        present: {
          ...present,
          paths: updatedPaths,
          seams: updatedSeams,
        },
        currentPathId: null,
      });
      return;
    }

    saveState();
    
    let finalPoints = [...currentPath.points];
    
    // Check if last point is overlapping with any other point IN THE SAME PATH
    // This prevents duplicate points from being created within the same path
    // Note: Overlapping with points from OTHER paths is intentional (for connecting patterns)
    if (finalPoints.length >= 2) {
      const lastPoint = finalPoints[finalPoints.length - 1];
      const tolerance = 1;
      
      // Only check against other points in the SAME path
      for (let i = 0; i < finalPoints.length - 1; i++) {
        const point = finalPoints[i];
        const dx = point.x - lastPoint.x;
        const dy = point.y - lastPoint.y;
        if (Math.sqrt(dx * dx + dy * dy) < tolerance) {
          // Found duplicate point in same path, remove the last one
          finalPoints = finalPoints.slice(0, -1);
          break;
        }
      }
    }
    
    // Ensure we still have at least 2 points after overlap removal
    if (finalPoints.length < 2) {
      return;
    }
    
    set({
      present: {
        ...present,
        paths: present.paths.map((path) =>
          path.id === currentPathId ? { ...path, points: finalPoints, closed: true } : path,
        ),
      },
      currentPathId: null,
    });
  },

  movePoint: (id, x, y) => {
    const { present } = get();
    set({
      present: {
        ...present,
        paths: updatePointInPath(present.paths, id, (point) => ({ ...point, x, y })),
      },
    });
  },

  updatePointsBatch: (updates) => {
    const { present } = get();
    if (!updates || updates.length === 0) return;

    const byId = new Map<string, (typeof updates)[number]>();
    for (const u of updates) {
      if (!u || !u.id) continue;
      byId.set(u.id, u);
    }
    if (byId.size === 0) return;

    set({
      present: {
        ...present,
        paths: present.paths.map((path) => {
          let changed = false;
          const nextPoints = path.points.map((pt) => {
            const u = byId.get(pt.id);
            if (!u) return pt;
            changed = true;

            const next: typeof pt = { ...pt };
            if (u.x !== undefined) next.x = u.x;
            if (u.y !== undefined) next.y = u.y;
            if (u.handleIn !== undefined) next.handleIn = { ...u.handleIn };
            if (u.handleOut !== undefined) next.handleOut = { ...u.handleOut };
            return next;
          });

          return changed ? { ...path, points: nextPoints } : path;
        }),
      },
    });
  },

  moveHandle: (pointId, type, dx, dy, _save, altPressed = false) => {
    const { present } = get();
    set({
      present: {
        ...present,
        paths: updatePointInPath(present.paths, pointId, (point) => {
          const base = {
            ...point,
            [type]: { dx, dy },
          } as typeof point;

          if (altPressed) {
            return base;
          }

          const opposite = type === 'handleIn' ? 'handleOut' : 'handleIn';
          return {
            ...base,
            [opposite]: { dx: -dx, dy: -dy },
          } as typeof point;
        }),
      },
    });
  },

  toggleHandlesForPoint: (id) => {
    const { present, saveState } = get();
    saveState();

    const spawned = computeSpawnHandlesForPoint(present.paths, id);

    set({
      present: {
        ...present,
        paths: present.paths.map((path) => ({
          ...path,
          points: path.points.map((point) => {
            if (point.id !== id) return point;
            const hasHandles =
              point.handleIn.dx !== 0 ||
              point.handleIn.dy !== 0 ||
              point.handleOut.dx !== 0 ||
              point.handleOut.dy !== 0;

            return hasHandles
              ? {
                  ...point,
                  handleIn: { dx: 0, dy: 0 },
                  handleOut: { dx: 0, dy: 0 },
                }
              : {
                  ...point,
                  handleIn: spawned.handleIn,
                  handleOut: spawned.handleOut,
                };
          }),
        })),
      },
    });
  },

  startHandleMove: () => {
    const { isDraggingHandle, saveState } = get();
    if (!isDraggingHandle) {
      saveState();
      set({ isDraggingHandle: true });
    }
  },

  endHandleMove: () => {
    set({ isDraggingHandle: false });
  },

  clearJustPlacedPointId: () => set({ justPlacedPointId: null }),
  // set per-point seam allowance (in millimeters) for the edge from this point to the next
  setPointSeamRespect: (pointId: string, mm?: number) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        paths: present.paths.map((path) => ({
          ...path,
          points: path.points.map((pt) => (pt.id === pointId ? { ...pt, seamRespectMm: mm } : pt)),
        })),
      },
    });
  },
});
