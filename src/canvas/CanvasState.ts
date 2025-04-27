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
export type Tool = 'pen' | 'background';

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

  // Actions
  addPoint: (x: number, y: number, sharp?: boolean) => string;
  finishCurrentPath: () => void;
  movePoint: (id: string, x: number, y: number) => void;
  moveHandle: (pointId: string, type: 'handleIn' | 'handleOut', dx: number, dy: number, save?: boolean) => void;
  toggleHandlesForPoint: (id: string) => void;
  startHandleMove: (pointId: string) => void;

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

  saveState: () => void;
  undo: () => void;
  redo: () => void;
}

export const useCanvasState = create<CanvasState>((set, get) => ({
  currentPathId: null,
  currentTool: 'pen',
  selectedBackgroundId: null,

  present: {
    paths: [],
    backgroundImages: [],
  },
  past: [],
  future: [],

  saveState: () => {
    set((state) => ({
      past: [...state.past, JSON.parse(JSON.stringify(state.present))],
      future: [],
    }));
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
            p.id === get().currentPathId ? { ...p, points: [...p.points, point] } : p
          ),
          backgroundImages,
        },
      });
    } else {
      const newPathId = crypto.randomUUID();
      set({
        present: {
          paths: [...paths, { id: newPathId, points: [point], closed: false }],
          backgroundImages,
        },
        currentPathId: newPathId,
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
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        paths: present.paths.map((path) => ({
          ...path,
          points: path.points.map((point) =>
            point.id === id ? { ...point, x, y } : point
          ),
        })),
      },
    });
  },

  moveHandle: (pointId, type, dx, dy, save = true) => {
    const { present, saveState } = get();
    if (save) saveState();
    set({
      present: {
        ...present,
        paths: present.paths.map((path) => ({
          ...path,
          points: path.points.map((point) =>
            point.id === pointId ? { ...point, [type]: { dx, dy } } : point
          ),
        })),
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
  startHandleMove: (pointId) => {
    const { present, saveState } = get();
    saveState(); // Save BEFORE first move
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
  
}));
