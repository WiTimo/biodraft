import type { CanvasStateCreator, ToolSlice } from '../types';

export const createToolSlice: CanvasStateCreator<ToolSlice> = (set, get, _api) => ({
  currentPathId: null,
  currentTool: 'select',
  setTool: (tool) => {
    set({ currentTool: tool });

    const state = get();
    state.clearSelectedPointIds();
    state.deselectPoint();
    state.deselectBackgroundImages();

    set({
      selectionRect: null,
      selectionStart: null,
    });
  },
});