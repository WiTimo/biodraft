import type { CanvasStateCreator, SelectionSlice } from '../types';
import { filterSeamsReferencingPoints } from '../utils';

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

  hoveredPathId: null,
  setHoveredPathId: (id) => set({ hoveredPathId: id }),

  textureInspectPathId: null,
  setTextureInspectPathId: (id) => set({ textureInspectPathId: id }),

  deleteSelectedPoint: () => {
    const { selectedPointId, present, saveState } = get();
    if (!selectedPointId) return;

    saveState();
    
    // Remove the point from all paths (handles shared points)
    const updatedPaths = present.paths
      .map((path) => ({
        ...path,
        points: path.points.filter((point) => point.id !== selectedPointId),
      }))
      // Clean up any paths that now have no points
      .filter((path) => path.points.length > 0);
    
    // Clean up seams that reference the deleted point
    const deletedPointIds = new Set([selectedPointId]);
    const updatedSeams = filterSeamsReferencingPoints(present.seams, deletedPointIds);
    
    set({
      present: {
        ...present,
        paths: updatedPaths,
        seams: updatedSeams,
      },
      selectedPointId: null,
    });
  },

  deleteSelectedPoints: () => {
    const { selectedPointIds, present, saveState } = get();
    if (selectedPointIds.length === 0) return;

    saveState();
    
    // Remove the points from all paths (handles shared points)
    const updatedPaths = present.paths
      .map((path) => ({
        ...path,
        points: path.points.filter((point) => !selectedPointIds.includes(point.id)),
      }))
      // Clean up any paths that now have no points
      .filter((path) => path.points.length > 0);
    
    // Clean up seams that reference any deleted points
    const deletedPointIds = new Set(selectedPointIds);
    const updatedSeams = filterSeamsReferencingPoints(present.seams, deletedPointIds);
    
    set({
      present: {
        ...present,
        paths: updatedPaths,
        seams: updatedSeams,
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

  // Selection drag for double-click-drag behaviour
  selectionDragActive: false,
  selectionDragStart: null,
  selectionDragOriginalPoints: null,
  selectionDragOriginalTextures: null,
  selectionDragPendingStart: null,
  setSelectionDragPendingStart: (start) => set({ selectionDragPendingStart: start }),
  startSelectionDrag: (start, originalPoints, originalTextures = []) => {
    const { saveState } = get();
    saveState();
    set({ selectionDragActive: true, selectionDragStart: start, selectionDragOriginalPoints: originalPoints, selectionDragOriginalTextures: originalTextures, selectionDragPendingStart: null });
  },
  endSelectionDrag: () => set({ selectionDragActive: false, selectionDragStart: null, selectionDragOriginalPoints: null, selectionDragOriginalTextures: null }),
});
