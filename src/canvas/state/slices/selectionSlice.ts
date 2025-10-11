import type { CanvasStateCreator, SelectionSlice } from '../types';

export const createSelectionSlice: CanvasStateCreator<SelectionSlice> = (set, get, _api) => ({
  selectionRect: null,
  selectionStart: null,
  setSelectionRect: (rect) => set({ selectionRect: rect }),
  setSelectionStart: (start) => set({ selectionStart: start }),

  selectedPointId: null,
  selectPoint: (id) => set({ selectedPointId: id }),
  deselectPoint: () => set({ selectedPointId: null }),

  selectedPointIds: [],
  setSelectedPointIds: (ids) => set({ selectedPointIds: ids }),
  clearSelectedPointIds: () => set({ selectedPointIds: [] }),

  deleteSelectedPoint: () => {
    const { selectedPointId, present, saveState } = get();
    if (!selectedPointId) return;

    saveState();
    set({
      present: {
        ...present,
        paths: present.paths.map((path) => ({
          ...path,
          points: path.points.filter((point) => point.id !== selectedPointId),
        })),
      },
      selectedPointId: null,
    });
  },

  deleteSelectedPoints: () => {
    const { selectedPointIds, present, saveState } = get();
    if (selectedPointIds.length === 0) return;

    saveState();
    set({
      present: {
        ...present,
        paths: present.paths.map((path) => ({
          ...path,
          points: path.points.filter((point) => !selectedPointIds.includes(point.id)),
        })),
      },
      selectedPointIds: [],
      selectedPointId: null,
      selectionRect: null,
      selectionStart: null,
    });
  },

  mousePosition: null,
  setMousePosition: (mousePosition) => set({ mousePosition }),

  snapGuides: { x: null, y: null },
  setSnapGuides: (guides) => set({ snapGuides: guides }),
});
