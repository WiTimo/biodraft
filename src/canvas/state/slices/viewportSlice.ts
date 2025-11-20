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

  frontCollapsed: false,
  backCollapsed: false,
  toggleFrontCollapse: () => set((state) => {
    const newFrontCollapsed = !state.frontCollapsed;
    // If enabling front collapsed, ensure back isn't also collapsed
    const backCollapsed = newFrontCollapsed ? false : state.backCollapsed;
    return { frontCollapsed: newFrontCollapsed, backCollapsed };
  }),
  toggleBackCollapse: () => set((state) => {
    const newBackCollapsed = !state.backCollapsed;
    // If enabling back collapsed, ensure front isn't also collapsed
    const frontCollapsed = newBackCollapsed ? false : state.frontCollapsed;
    return { backCollapsed: newBackCollapsed, frontCollapsed };
  }),
});
