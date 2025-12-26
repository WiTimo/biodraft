import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CanvasState, CanvasStateCreator } from './types';
import { createHistorySlice } from './slices/historySlice';
import { createToolSlice } from './slices/toolSlice';
import { createViewportSlice } from './slices/viewportSlice';
import { createBackgroundSlice } from './slices/backgroundSlice';
import { createPointSlice } from './slices/pointSlice';
import { createSelectionSlice } from './slices/selectionSlice';
import { createClipboardSlice } from './slices/clipboardSlice';
import { createSeamSlice } from './slices/seamSlice';
import { createTextureSlice } from './slices/textureSlice';

const createCanvasState: CanvasStateCreator<CanvasState> = (set, get, api) => ({
  ...createHistorySlice(set, get, api),
  ...createToolSlice(set, get, api),
  ...createViewportSlice(set, get, api),
  ...createBackgroundSlice(set, get, api),
  ...createPointSlice(set, get, api),
  ...createSelectionSlice(set, get, api),
  ...createClipboardSlice(set, get, api),
  ...createSeamSlice(set, get, api),
  ...createTextureSlice(set, get, api),
});

export const useCanvasState = create<CanvasState>()(
  persist(
    (set, get, api) => createCanvasState(set, get, api),
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
    },
  ),
);