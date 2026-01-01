import type { CanvasState, CanvasStateCreator, HistorySlice } from '../types';
import { clonePresent, INITIAL_PRESENT, filterSeamsReferencingPoints } from '../utils';

const MAN_IMAGE_IDS = new Set(['static-man', 'static-man-back']);

function splitManImages(backgroundImages: any[]) {
  const man: any[] = [];
  const rest: any[] = [];
  for (const img of backgroundImages) {
    if (img && MAN_IMAGE_IDS.has(img.id)) man.push(img);
    else rest.push(img);
  }
  return { man, rest };
}

function clonePresentForHistory(present: any) {
  // Never record man images in history.
  const { rest } = splitManImages(present.backgroundImages ?? []);
  return clonePresent({ ...present, backgroundImages: rest });
}

export const createHistorySlice: CanvasStateCreator<HistorySlice> = (set, _get, _api) => ({
  present: INITIAL_PRESENT,
  past: [],
  future: [],
  saveState: () => {
    set((state) => ({
      past: [...state.past, clonePresentForHistory(state.present)],
      future: [],
    }));
  },
  undo: () => {
    set((state) => {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);

      const { man } = splitManImages(state.present.backgroundImages ?? []);
      const mergedPrevious = {
        ...previous,
        // Keep current man images behind history-managed backgrounds.
        backgroundImages: [...man, ...(previous.backgroundImages ?? [])],
      };

      // If the current path id references a path that no longer exists after undo,
      // clear currentPathId and justPlacedPointId to avoid leaving the pen tool in an invalid state.
      const currentPathId: string | null = (state as any).currentPathId ?? null;
      const hasPath = currentPathId ? mergedPrevious.paths.some(p => p.id === currentPathId) : false;

      return {
        past: newPast,
        present: mergedPrevious,
        future: [clonePresentForHistory(state.present), ...state.future],
        currentPathId: hasPath ? currentPathId : null,
        justPlacedPointId: hasPath ? (state as any).justPlacedPointId ?? null : null,
      };
    });
  },
  redo: () => {
    set((state) => {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;

      const { man } = splitManImages(state.present.backgroundImages ?? []);
      const mergedNext = {
        ...next,
        backgroundImages: [...man, ...(next.backgroundImages ?? [])],
      };
      return {
        past: [...state.past, clonePresentForHistory(state.present)],
        present: mergedNext,
        future: rest,
      };
    });
  },
  resetCanvas: () => {
    set(() => ({
      present: clonePresent(INITIAL_PRESENT),
      past: [],
      future: [],
      selectedPointId: null,
      selectedPointIds: [],
      selectedBackgroundId: null,
      selectionRect: null,
      selectionStart: null,
      threeDEnabled: false,
      splitWidth: window.innerWidth / 2,
    }) as Partial<CanvasState>);
    window.location.reload();
  },

  // Clear canvas without reloading (useful when applying default human images after generation)
  clearCanvas: (preserveManImages: boolean = false) => {
    set((state) => {
      const newPresent = clonePresent(INITIAL_PRESENT);
      if (preserveManImages) {
        const { man } = splitManImages(state.present.backgroundImages ?? []);
        newPresent.backgroundImages = [...man, ...(newPresent.backgroundImages ?? [])];
      }

      return {
        present: newPresent,
        past: [],
        future: [],
        selectedPointId: null,
        selectedPointIds: [],
        selectedBackgroundId: null,
        selectionRect: null,
        selectionStart: null,
      } as Partial<CanvasState>;
    });
  },
  cleanupEmptyPaths: () => {
    set((state) => {
      const validPaths = state.present.paths.filter(path => path.points.length > 0);
      
      if (validPaths.length !== state.present.paths.length) {
        // Collect point IDs from removed paths
        const removedPaths = state.present.paths.filter(path => path.points.length === 0);
        const deletedPointIds = new Set(removedPaths.flatMap(path => path.points.map(p => p.id)));
        const updatedSeams = filterSeamsReferencingPoints(state.present.seams, deletedPointIds);
        console.log(`Cleaned up ${state.present.paths.length - validPaths.length} empty path(s)`);
        if (updatedSeams.length !== state.present.seams.length) {
          console.log(`Cleaned up ${state.present.seams.length - updatedSeams.length} orphaned seam(s)`);
        }
        return {
          present: {
            ...state.present,
            paths: validPaths,
            seams: updatedSeams,
          },
        };
      }
      
      return state;
    });
  },
});
