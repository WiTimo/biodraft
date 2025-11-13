import type { CanvasState, CanvasStateCreator, HistorySlice } from '../types';
import { clonePresent, INITIAL_PRESENT } from '../utils';

export const createHistorySlice: CanvasStateCreator<HistorySlice> = (set, _get, _api) => ({
  present: INITIAL_PRESENT,
  past: [],
  future: [],
  saveState: () => {
    set((state) => ({
      past: [...state.past, clonePresent(state.present)],
      future: [],
    }));
  },
  undo: () => {
    set((state) => {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      return {
        past: newPast,
        present: previous,
        future: [clonePresent(state.present), ...state.future],
      };
    });
  },
  redo: () => {
    set((state) => {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        past: [...state.past, clonePresent(state.present)],
        present: next,
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
  cleanupEmptyPaths: () => {
    set((state) => {
      const validPaths = state.present.paths.filter(path => path.points.length > 0);
      
      if (validPaths.length !== state.present.paths.length) {
        console.log(`Cleaned up ${state.present.paths.length - validPaths.length} empty path(s)`);
        return {
          present: {
            ...state.present,
            paths: validPaths,
          },
        };
      }
      
      return state;
    });
  },
});
