import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

interface Seam {
  from: string;
  to: string;
}


// TOOLS
export type Tool = 'pen' | 'background' | 'select' | 'seam';

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

  zoom: number;
  setZoom: (zoom: number) => void;
  offset: { x: number; y: number };
  setOffset: (offset: { x: number; y: number }) => void;

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

  selectionRect: { x: number; y: number; width: number; height: number } | null;
  selectionStart: { x: number; y: number } | null;
  setSelectionRect: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  setSelectionStart: (start: { x: number; y: number } | null) => void;

  selectedPointId: string | null;
  selectPoint: (id: string) => void;
  deselectPoint: () => void;
  deleteSelectedPoint: () => void;
  deleteSelectedPoints: () => void;

  resetCanvas: () => void;

  mousePosition: { x: number; y: number } | null,
  setMousePosition: (pos: { x: number; y: number } | null) => void,

  snapGuides: { x: number | null; y: number | null };
  setSnapGuides: (guides: { x: number | null; y: number | null }) => void;
  clipboard: Path[] | null;
  setClipboard: (paths: Path[]) => void;
  copySelectedPoints: () => void;
  pasteClipboardPoints: () => void;

  seams: [string, string][];
  addSeam: (pointId1: string, pointId2: string) => void;
  removeSeam: (pointId1: string, pointId2: string) => void;
  isSeam: (pointId1: string, pointId2: string) => boolean;
}
export const useCanvasState = create<CanvasState>()(
  persist(
    (set, get) => ({
      currentPathId: null,
      currentTool: 'select',
      selectedBackgroundId: null,
      snapGuides: { x: null, y: null },
      setSnapGuides: (guides) => set({ snapGuides: guides }),

      seams: [],
      addSeam: (id1, id2) => {
        set((state) => {
          const exists = state.seams.some(([a, b]) => (a === id1 && b === id2) || (a === id2 && b === id1));
          if (exists) return {};
          return { seams: [...state.seams, [id1, id2]] };
        });
      },
      removeSeam: (id1, id2) => {
        set((state) => ({
          seams: state.seams.filter(([a, b]) => !(a === id1 && b === id2) && !(a === id2 && b === id1)),
        }));
      },
      isSeam: (id1, id2) => {
        const seams = get().seams;
        return seams.some(([a, b]) => (a === id1 && b === id2) || (a === id2 && b === id1));
      },


      clipboard: null,
      setClipboard: (points) => set({ clipboard: points }),
      copySelectedPoints: () => {
        const { selectedPointIds, present, setClipboard } = get();
        const matchingPaths = present.paths.filter(path =>
          path.points.some(p => selectedPointIds.includes(p.id))
        );

        // Filter only the selected points from each path, but preserve `closed` if fully selected
        const copiedPaths = matchingPaths.map(path => {
          const selectedPoints = path.points.filter(p => selectedPointIds.includes(p.id));
          const isFullySelected = selectedPoints.length === path.points.length;
          return {
            id: crypto.randomUUID(),
            closed: isFullySelected ? path.closed : false,
            points: JSON.parse(JSON.stringify(selectedPoints)),
          };
        });

        setClipboard(copiedPaths);
      },


      pasteClipboardPoints: () => {
        const { clipboard, present, saveState } = get();
        if (!clipboard || clipboard.length === 0) return;

        const offsetAmount = 30;
        const newPaths: Path[] = clipboard.map(path => {
          const newPoints = path.points.map(p => ({
            ...p,
            id: crypto.randomUUID(),
            x: p.x + offsetAmount,
            y: p.y + offsetAmount,
          }));
          return {
            id: crypto.randomUUID(),
            closed: path.closed,
            points: newPoints,
          };
        });

        const allNewPointIds = newPaths.flatMap(p => p.points.map(pt => pt.id));

        saveState();
        set({
          present: {
            ...present,
            paths: [...present.paths, ...newPaths],
          },
          selectedPointIds: allNewPointIds,
          selectedPointId: allNewPointIds.length === 1 ? allNewPointIds[0] : null,
        });
      },


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

      mousePosition: null,
      setMousePosition: (pos) => set({ mousePosition: pos }),

      deleteSelectedPoints: () => {
        const { selectedPointIds, present, saveState } = get();
        if (selectedPointIds.length === 0) return;

        saveState();

        set({
          present: {
            ...present,
            paths: present.paths.map((path) => ({
              ...path,
              points: path.points.filter((p) => !selectedPointIds.includes(p.id)),
            })),
          },
          selectedPointIds: [],
          selectedPointId: null,
          selectionRect: null,
          selectionStart: null,
        });
      },

      selectionRect: null,
      selectionStart: null,
      setSelectionRect: (rect) => set({ selectionRect: rect }),
      setSelectionStart: (start) => set({ selectionStart: start }),

      setZoom: (zoom) => set({ zoom }),
      zoom: 1,
      offset: { x: 0, y: 0 },
      setOffset: (offset) => set({ offset }),

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




      setTool: (tool) => {
        set({ currentTool: tool });

        get().clearSelectedPointIds();
        get().deselectPoint();
        get().deselectBackgroundImages();
        set({
          selectionRect: null,
          selectionStart: null,
        });
      },

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

      resetCanvas: () => {
        set({
          present: { paths: [], backgroundImages: [] },
          past: [],
          future: [],
          selectedPointId: null,
          selectedPointIds: [],
          selectedBackgroundId: null,
          selectionRect: null,
          selectionStart: null,
        });
        window.location.reload()
      },
    }),
    {
      name: 'techpack-canvas-state',
      partialize: (state) => ({
        present: state.present,
        zoom: state.zoom,
        offset: state.offset,
      }),
    }
  )
);


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
