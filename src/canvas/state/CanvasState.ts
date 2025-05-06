import { create } from 'zustand';

interface Handle {
  dx: number;
  dy: number;
}

interface Point {
  id: string;
  x: number;
  y: number;
  handleIn: Handle;
  handleOut: Handle;
}

interface Path {
  id: string;
  points: Point[];
  closed: boolean;
}

interface BackgroundImage {
  id: string;
  src: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  locked: boolean;
}

// TOOLS
export type Tool = 'pen' | 'background' | 'select';

interface CanvasState {
  currentPathId: string | null;
  currentTool: Tool;
  selectedBackgroundId: string | null;

  present: {
    paths: Path[];
    backgroundImages: BackgroundImage[];
  };
  past: { paths: Path[]; backgroundImages: BackgroundImage[] }[];
  future: { paths: Path[]; backgroundImages: BackgroundImage[] }[];
  justPlacedPointId: string | null;
  isDraggingHandle: boolean;

  // Actions
  addPoint: (x: number, y: number, sharp?: boolean) => string;
  finishCurrentPath: () => void;
  movePoint: (id: string, x: number, y: number) => void;
  moveHandle: (pointId: string, type: 'handleIn' | 'handleOut', dx: number, dy: number, save?: boolean, altPressed?: boolean) => void;
  toggleHandlesForPoint: (id: string) => void;
  startHandleMove: (pointId: string) => void;
  endHandleMove: () => void;

  setTool: (tool: Tool) => void;

  addBackgroundImage: (src: string, id?: string) => void;
  moveBackgroundImage: (id: string, x: number, y: number) => void;
  scaleBackgroundImage: (id: string, scale: number) => void;
  rotateBackgroundImage: (id: string, rotation: number) => void;
  toggleLockBackgroundImage: (id: string) => void;
  selectBackgroundImage: (id: string) => void;
  deselectBackgroundImages: () => void;
  updateBackgroundImageTransform: (id: string, transform: { scaleX: number; scaleY: number; rotation: number }) => void;
  updateBackgroundImageFullTransform: (id: string, transform: { x: number; y: number; scaleX: number; scaleY: number; rotation: number }) => void;
  clearJustPlacedPointId: () => void;
  selectedPointIds: string[];
  setSelectedPointIds: (ids: string[]) => void;
  clearSelectedPointIds: () => void;
  deleteSelectedBackgroundImage: () => void;
  saveState: () => void;
  undo: () => void;
  redo: () => void;

  selectedPointId: string | null;
  selectPoint: (id: string) => void;
  deselectPoint: () => void;
  deleteSelectedPoint: () => void;
}

export const useCanvasState = create<CanvasState>((set, get) => ({
  currentPathId: null,
  currentTool: 'select',
  selectedBackgroundId: null,

  present: {
    paths: [],
    backgroundImages: [],
  },
  past: [],
  future: [],
  justPlacedPointId: null,
  isDraggingHandle: false,
  saveState: () => {
    set((state) => ({
      past: [...state.past, JSON.parse(JSON.stringify(state.present))],
      future: [],
    }));
  },

  selectedPointId: null,
  selectedPointIds: [],
  setSelectedPointIds: (ids) => set({ selectedPointIds: ids }),
  clearSelectedPointIds: () => set({ selectedPointIds: [] }),
  selectPoint: (id) => set({ selectedPointId: id }),
  deselectPoint: () => set({ selectedPointId: null }),

  deleteSelectedPoint: () => {
    const { selectedPointId, present, saveState } = get();
    if (!selectedPointId) return;

    saveState();
    set({
      present: {
        ...present,
        paths: present.paths.map((path) => ({
          ...path,
          points: path.points.filter((p) => p.id !== selectedPointId),
        })),
      },
      selectedPointId: null,
    });
  },
  deleteSelectedBackgroundImage: () => {
    const { selectedBackgroundId, present, saveState } = get();
    if (!selectedBackgroundId) return;

    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.filter((img) => img.id !== selectedBackgroundId),
      },
      selectedBackgroundId: null,
    });
  },


  undo: () => {
    set((state) => {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, state.past.length - 1);
      return {
        past: newPast,
        present: previous,
        future: [state.present, ...state.future],
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return {
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
      };
    });
  },

  addPoint: (x, y, sharp = false) => {
    const { present, saveState } = get();
    saveState();

    const point = {
      id: crypto.randomUUID(),
      x,
      y,
      handleIn: sharp ? { dx: 0, dy: 0 } : { dx: -30, dy: 0 },
      handleOut: sharp ? { dx: 0, dy: 0 } : { dx: 30, dy: 0 },
    };

    const { paths, backgroundImages } = present;

    if (get().currentPathId) {
      set({
        present: {
          paths: paths.map((p) =>
            p.id === get().currentPathId
              ? { ...p, points: [...p.points, point] }
              : p
          ),
          backgroundImages,
        },
        justPlacedPointId: point.id, // 🆕 Mark just placed
      });
    } else {
      const newPathId = crypto.randomUUID();
      set({
        present: {
          paths: [
            ...paths,
            { id: newPathId, points: [point], closed: false },
          ],
          backgroundImages,
        },
        currentPathId: newPathId,
        justPlacedPointId: point.id, // 🆕 Mark just placed
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
        paths: present.paths.map((p) =>
          p.id === currentPathId ? { ...p, closed: true } : p
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
        paths: updatePointInPath(present.paths, id, p => ({ ...p, x, y })),
      },
    });
  },

  moveHandle: (pointId, type, dx, dy, _save, altPressed = false) => {
    const { present } = get();
    set({
      present: {
        ...present,
        paths: updatePointInPath(present.paths, pointId, (point) => {
          const updated = {
            ...point,
            [type]: { dx, dy },
          };
          if (!altPressed) {
            const other = type === 'handleIn' ? 'handleOut' : 'handleIn';
            updated[other] = { dx: -dx, dy: -dy };
          }
          return updated;
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
              ? { ...point, handleIn: { dx: 0, dy: 0 }, handleOut: { dx: 0, dy: 0 } }
              : { ...point, handleIn: { dx: -30, dy: 0 }, handleOut: { dx: 30, dy: 0 } };
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




  setTool: (tool) => set({ currentTool: tool }),

  addBackgroundImage: (src, id) => {
    const { present, saveState } = get();
    saveState();
    const newImage = {
      id: id || crypto.randomUUID(),
      src,
      x: 100,
      y: 100,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 0.4,
      locked: false,
    };
    set({
      present: {
        ...present,
        backgroundImages: [...present.backgroundImages, newImage],
      },
    });
  },

  moveBackgroundImage: (id, x, y) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.map((img) =>
          img.id === id ? { ...img, x, y } : img
        ),
      },
    });
  },

  scaleBackgroundImage: (id, scale) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.map((img) =>
          img.id === id ? { ...img, scaleX: scale, scaleY: scale } : img
        ),
      },
    });
  },

  rotateBackgroundImage: (id, rotation) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.map((img) =>
          img.id === id ? { ...img, rotation } : img
        ),
      },
    });
  },

  toggleLockBackgroundImage: (id) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.map((img) =>
          img.id === id ? { ...img, locked: !img.locked } : img
        ),
      },
    });
  },

  selectBackgroundImage: (id) => set({ selectedBackgroundId: id }),
  deselectBackgroundImages: () => set({ selectedBackgroundId: null }),

  updateBackgroundImageTransform: (id, { scaleX, scaleY, rotation }) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.map((img) =>
          img.id === id ? { ...img, scaleX, scaleY, rotation } : img
        ),
      },
    });
  },
  updateBackgroundImageFullTransform: (id, { x, y, scaleX, scaleY, rotation }) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.map((img) =>
          img.id === id
            ? { ...img, x, y, scaleX, scaleY, rotation }
            : img
        ),
      },
    });
  },
  clearJustPlacedPointId: () => {
    set({ justPlacedPointId: null });
  },


}));



function updatePointInPath(paths: Path[], pointId: string, update: (pt: Point) => Point): Path[] {
  return paths.map(path => {
    const found = path.points.find(p => p.id === pointId);
    if (!found) return path;
    return {
      ...path,
      points: path.points.map(p => p.id === pointId ? update(p) : p),
    };
  });
}
