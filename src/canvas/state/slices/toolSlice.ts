import type { CanvasStateCreator, ToolSlice } from '../types';

export const createToolSlice: CanvasStateCreator<ToolSlice> = (set, get, _api) => ({
  currentPathId: null,
  currentTool: 'select',
  textureInteractionActive: false,
  textureLastInteractionAt: 0,
  setTool: (tool) => {
    set({ currentTool: tool });

    const state = get();
    state.clearSelectedPointIds();
    state.deselectPoint();
    state.deselectBackgroundImages();
    state.setSeamDeleteMode(false);

    set({
      selectionRect: null,
      selectionStart: null,
    });

    // Reset texture interaction when switching tools
    set({ textureInteractionActive: false });
  },
  setTextureInteractionActive: (active: boolean) => {
    set({ textureInteractionActive: active });
  },
  setTextureLastInteractionAt: (t: number) => {
    set({ textureLastInteractionAt: t });
  },
});
