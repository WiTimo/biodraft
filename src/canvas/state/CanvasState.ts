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

export interface PathTexture {
  /** Data URL (png/jpg) for the texture */
  src: string;
  /** pattern transforms (optional) */
  scaleX?: number;
  scaleY?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number; // degrees
  repeat?: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
}

interface Path {
  id: string;
  points: Point[];
  closed: boolean;
  /** optional texture fill for closed shapes */
  texture?: PathTexture | null;
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

type Segment = [string, string]; // pointId, pointId
type SegmentSeam = [Segment, Segment]; // segment A -> segment B

interface CanvasPresent {
  paths: Path[];
  backgroundImages: BackgroundImage[];
  seams: [string, string][];
}

// TOOLS
export type Tool = 'pen' | 'background' | 'select' | 'seam';

interface CanvasState {
  currentPathId: string | null;
  currentTool: Tool;
  selectedBackgroundId: string | null;

  present: CanvasPresent;
  past: CanvasPresent[];
  future: CanvasPresent[];
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
  removeBackgroundImage: (id: string) => void;
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

  seams: SegmentSeam[];
  addSeam: (seg1: Segment, seg2: Segment) => void;
  removeSeam: (seg1: Segment, seg2: Segment) => void;
  isSeam: (seg1: Segment, seg2: Segment) => boolean;

  addPathSeam: (seg1: Segment, seg2: Segment) => void;

  seamSelection: [string, string][];
  setSeamSelection: (selection: [string, string][]) => void;
  selectedSeamSegment: [string, string] | null;
  setSelectedSeamSegment: (segment: [string, string] | null) => void;

  swapSeam: (segment: Segment) => void;

  /** ▶️ TEXTURE ACTIONS */
  setTextureForPath: (pathId: string, texture: PathTexture | null) => void;
  clearTextureForPath: (pathId: string) => void;
  /** apply to all paths that contain any currently selected point(s) */
  setTextureForSelectedPaths: (texture: PathTexture | null) => void;
  /** optional, for later tweak UI */
  updateTextureForPath: (pathId: string, partial: Partial<PathTexture>) => void;

  threeDEnabled: boolean;
  toggle3D: () => void;
  splitWidth: number;
  setSplitWidth: (width: number) => void;

  cameraPos: { x: number; y: number; z: number };
  setCameraPos: (pos: { x: number; y: number; z: number }) => void;
  cameraTarget: { x: number; y: number; z: number };
  setCameraTarget: (target: { x: number; y: number; z: number }) => void;

  isShiftPressed: boolean;
  setIsShiftPressed: (v: boolean) => void;

  isAltPressed: boolean;
  setIsAltPressed: (v: boolean) => void;

  manImageCenters: Record<string, { x: number; y: number }>;
  setManImageCenter: (id: string, center: { x: number; y: number }) => void;

  isSimulationMode: boolean;
  setIsSimulationMode: (v: boolean) => void;
}

export const useCanvasState = create<CanvasState>()(
  persist(
    (set, get) => ({
      currentPathId: null,
      currentTool: 'select',
      selectedBackgroundId: null,
      snapGuides: { x: null, y: null },
      setSnapGuides: (guides) => set({ snapGuides: guides }),

      cameraPos: { x: 0, y: 1.5, z: 5 },
      cameraTarget: { x: 0, y: 0, z: 0 },

      setCameraPos: (cameraPos) => set({ cameraPos }),
      setCameraTarget: (cameraTarget) => set({ cameraTarget }),

      manImageCenters: {},
      setManImageCenter: (id: string, center: { x: number; y: number }) => set(state => ({
        manImageCenters: {
          ...state.manImageCenters,
          [id]: center,
        },
      })),

      removeBackgroundImage(id) {
        set(state => ({
          present: {
            ...state.present,
            backgroundImages: state.present.backgroundImages.filter(img => img.id !== id),
          },
        }));
      },

      isSimulationMode: false,
      setIsSimulationMode: (v) => set({ isSimulationMode: v }),

      threeDEnabled: false,
      toggle3D: () => set(state => ({ threeDEnabled: !state.threeDEnabled })),

      splitWidth: window.innerWidth / 2,
      setSplitWidth: (width) => set({ splitWidth: width }),

      isShiftPressed: false,
      setIsShiftPressed: (v: boolean) => set({ isShiftPressed: v }),

      isAltPressed: false,
      setIsAltPressed: (v: boolean) => set({ isAltPressed: v }),

      seamSelection: [] as [string, string][],
      setSeamSelection: (selection: [string, string][]) => set({ seamSelection: selection }),
      selectedSeamSegment: null as [string, string] | null,
      setSelectedSeamSegment: (segment: [string, string] | null) => set({ selectedSeamSegment: segment }),

      seams: [],
      addSeam: (segmentA, segmentB) => {
        set(state => {
          const segmentKey = ([a, b]: [string, string]) => [a, b].sort().join('_');
          const k1 = segmentKey(segmentA);
          const k2 = segmentKey(segmentB);
          const exists = state.present.seams.some(([s1, s2]) =>
            (segmentKey(s1) === k1 && segmentKey(s2) === k2) ||
            (segmentKey(s1) === k2 && segmentKey(s2) === k1)
          );
          if (exists) return {};

          return {
            present: {
              ...state.present,
              seams: [...state.present.seams, [segmentA, segmentB]],
            },
          };
        });
      },
      removeSeam: (seg1, seg2) => {
        const key = ([a, b]: [string, string]) => [a, b].sort().join('_');
        const k1 = key(seg1);
        const k2 = key(seg2);

        set(state => ({
          present: {
            ...state.present,
            seams: state.present.seams.filter(
              ([s1, s2]) => {
                const ks1 = key(s1);
                const ks2 = key(s2);
                return !((ks1 === k1 && ks2 === k2) || (ks1 === k2 && ks2 === k1));
              }
            ),
          }
        }));
      },

      swapSeam: (clickedSeg) => {
        set(state => {
          const normalize = ([a, b]: Segment) =>
            ([a, b].sort() as Segment);

          const target = normalize(clickedSeg);

          const newSeams = (state.present.seams as SegmentSeam[]).map(
            ([segA, segB]) => {
              const normA = normalize(segA);
              const normB = normalize(segB);

              if (normA[0] === target[0] && normA[1] === target[1]) {
                return [segA, [segB[1], segB[0]]] as SegmentSeam;
              }
              if (normB[0] === target[0] && normB[1] === target[1]) {
                return [[segA[1], segA[0]], segB] as SegmentSeam;
              }
              return [segA, segB] as SegmentSeam;
            }
          );

          return {
            present: {
              ...state.present,
              seams: newSeams,
            },
          };
        });
      },

      isSeam: (seg1, seg2) => {
        const key = ([a, b]: [string, string]) => [a, b].sort().join('_');
        const k1 = key(seg1);
        const k2 = key(seg2);
        return get().present.seams.some(([s1, s2]) => {
          const ks1 = key(s1);
          const ks2 = key(s2);
          return (ks1 === k1 && ks2 === k2) || (ks1 === k2 && ks2 === k1);
        });
      },

      addPathSeam: (a, b) => {
        set((state) => ({
          present: {
            ...state.present,
            seams: [...(state.present.seams || []), [a, b]],
          },
        }));
      },

      clipboard: null,
      setClipboard: (points) => set({ clipboard: points }),
      copySelectedPoints: () => {
        const { selectedPointIds, present, setClipboard } = get();
        const matchingPaths = present.paths.filter(path =>
          path.points.some(p => selectedPointIds.includes(p.id))
        );

        const copiedPaths = matchingPaths.map(path => {
          const selectedPoints = path.points.filter(p => selectedPointIds.includes(p.id));
          const isFullySelected = selectedPoints.length === path.points.length;
          return {
            id: crypto.randomUUID(),
            closed: isFullySelected ? path.closed : false,
            points: JSON.parse(JSON.stringify(selectedPoints)),
            texture: isFullySelected ? (path.texture ?? null) : null, // copy texture only if whole path selected
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
            texture: path.texture ?? null,
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
        seams: [],
      },
      past: [],
      future: [],
      justPlacedPointId: null,
      isDraggingHandle: false,
      saveState: () => {
        set((state) => ({
          past: [
            ...state.past,
            JSON.parse(JSON.stringify({
              paths: state.present.paths,
              backgroundImages: state.present.backgroundImages,
              seams: state.present.seams,
            })),
          ],
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
              seams: present.seams
            },
            justPlacedPointId: point.id,
          });
        } else {
          const newPathId = crypto.randomUUID();
          set({
            present: {
              paths: [
                ...paths,
                { id: newPathId, points: [point], closed: false, texture: null },
              ],
              backgroundImages,
              seams: present.seams,
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

      /** ▶️ TEXTURE impl */
      setTextureForPath: (pathId, texture) => {
        const { present, saveState } = get();
        saveState();
        set({
          present: {
            ...present,
            paths: present.paths.map(p => p.id === pathId ? { ...p, texture: texture } : p),
          }
        });
      },
      clearTextureForPath: (pathId) => {
        const { present, saveState } = get();
        saveState();
        set({
          present: {
            ...present,
            paths: present.paths.map(p => p.id === pathId ? { ...p, texture: null } : p),
          }
        });
      },
      setTextureForSelectedPaths: (texture) => {
        const { selectedPointIds, present, saveState } = get();
        // find all paths that contain any selected point
        const selectedPathIds = new Set<string>();
        for (const path of present.paths) {
          if (path.points.some(pt => selectedPointIds.includes(pt.id))) {
            selectedPathIds.add(path.id);
          }
        }
        if (selectedPathIds.size === 0) return;
        saveState();
        set({
          present: {
            ...present,
            paths: present.paths.map(p => selectedPathIds.has(p.id) ? { ...p, texture: texture } : p),
          }
        });
      },
      updateTextureForPath: (pathId, partial) => {
        const { present, saveState } = get();
        saveState();
        set({
          present: {
            ...present,
            paths: present.paths.map(p => {
              if (p.id !== pathId) return p;
              const base = p.texture ?? { src: '' };
              return { ...p, texture: { ...base, ...partial } };
            }),
          }
        });
      },

      resetCanvas: () => {
        set({
          present: { paths: [], backgroundImages: [], seams: [] },
          past: [],
          future: [],
          selectedPointId: null,
          selectedPointIds: [],
          selectedBackgroundId: null,
          selectionRect: null,
          selectionStart: null,
          threeDEnabled: false,
          splitWidth: window.innerWidth / 2,
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
        threeDEnabled: state.threeDEnabled,
        splitWidth: state.splitWidth,
        cameraPos: state.cameraPos,
        cameraTarget: state.cameraTarget,
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
