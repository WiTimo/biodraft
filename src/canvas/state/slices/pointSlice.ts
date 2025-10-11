import type { CanvasStateCreator, PointSlice } from '../types';
import { updatePointInPath } from '../utils';

export const createPointSlice: CanvasStateCreator<PointSlice> = (set, get, _api) => ({
  justPlacedPointId: null,
  isDraggingHandle: false,

  addPoint: (x, y, sharp = false) => {
    const { present, saveState, currentPathId } = get();
    saveState();

    const point = {
      id: crypto.randomUUID(),
      x,
      y,
      handleIn: sharp ? { dx: 0, dy: 0 } : { dx: -30, dy: 0 },
      handleOut: sharp ? { dx: 0, dy: 0 } : { dx: 30, dy: 0 },
    };

    if (currentPathId) {
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

    saveState();
    set({
      present: {
        ...present,
        paths: present.paths.map((path) =>
          path.id === currentPathId ? { ...path, closed: true } : path,
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
                  handleIn: { dx: -200, dy: 0 },
                  handleOut: { dx: 200, dy: 0 },
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
});
