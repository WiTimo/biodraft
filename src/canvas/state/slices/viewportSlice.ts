import type { CanvasStateCreator, ViewportSlice } from '../types';

export const createViewportSlice: CanvasStateCreator<ViewportSlice> = (set, _get, _api) => ({
  zoom: 1,
  setZoom: (zoom) => set({ zoom }),
  offset: { x: 0, y: 0 },
  setOffset: (offset) => set({ offset }),

  threeDEnabled: false,
  toggle3D: () => set((state) => ({ threeDEnabled: !state.threeDEnabled })),

  splitWidth: window.innerWidth / 2,
  setSplitWidth: (width) => set({ splitWidth: width }),

  cameraPos: { x: 0, y: 1.5, z: 5 },
  setCameraPos: (cameraPos) => set({ cameraPos }),
  cameraTarget: { x: 0, y: 0, z: 0 },
  setCameraTarget: (cameraTarget) => set({ cameraTarget }),

  isShiftPressed: false,
  setIsShiftPressed: (isShiftPressed) => set({ isShiftPressed }),

  isAltPressed: false,
  setIsAltPressed: (isAltPressed) => set({ isAltPressed }),

  isSimulationMode: false,
  setIsSimulationMode: (isSimulationMode) => set({ isSimulationMode }),

  manImageCenters: {},
  setManImageCenter: (id, center) => set((state) => ({
    manImageCenters: {
      ...state.manImageCenters,
      [id]: center,
    },
  })),

  // DXF scaling controls how coordinates are scaled when importing/exporting DXF files.
  // Default 1 = no scaling. Typical usage: if DXF is in mm and editor in px you might set 100.
  dxfScale: 1,
  setDxfScale: (scale) => set({ dxfScale: scale }),

  // DXF simplification settings
  dxfSimplifyEnabled: true,
  dxfSimplifyTolerance: 2,
  setDxfSimplify: (enabled: boolean) => set({ dxfSimplifyEnabled: enabled }),
  setDxfSimplifyTolerance: (tolerance: number) => set({ dxfSimplifyTolerance: tolerance }),
});
