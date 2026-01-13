import type { CanvasStateCreator, ViewportSlice } from '../types';
import { DXF_CONFIG } from '../../../config/dxfConfig';
import type { LanguageCode } from '../../../config/languages';

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

  // Ctrl modifier used to temporarily disable helpers (snap guides / grid snapping)
  isCtrlPressed: false,
  setIsCtrlPressed: (isCtrlPressed) => set({ isCtrlPressed }),

  // Space/middle-mouse state used for panning
  isSpacePressed: false,
  setIsSpacePressed: (isSpacePressed) => set({ isSpacePressed }),
  isPanning: false,
  setIsPanning: (isPanning) => set({ isPanning }),

  isSimulationMode: false,
  setIsSimulationMode: (isSimulationMode) => set({ isSimulationMode }),

  manImageCenters: {},
  setManImageCenter: (id, center) => set((state) => ({
    manImageCenters: {
      ...state.manImageCenters,
      [id]: center,
    },
  })),

  // Rulers and grid visibility
  showLeftRuler: true,
  setShowLeftRuler: (v: boolean) => set({ showLeftRuler: v }),
  showTopRuler: true,
  setShowTopRuler: (v: boolean) => set({ showTopRuler: v }),
  gridEnabled: true,
  setGridEnabled: (v: boolean) => set({ gridEnabled: v }),

  // Theme
  theme: 'system',
  setTheme: (t: 'light' | 'dark' | 'system') => set({ theme: t }),

  // Language
  language: 'en' as LanguageCode,
  setLanguage: (language: LanguageCode) => set({ language }),

  // Units & metric unit (used by rulers and defaults)
  units: 'metric',
  setUnits: (u: 'metric' | 'imperial') => set({ units: u }),
  metricUnit: 'mm',
  setMetricUnit: (u: 'cm' | 'mm') => set({ metricUnit: u }),

  // Default human
  defaultHuman: {
    gender: 'male',
    units: 'metric',
    height: 170,
    weight: 70,
    muscle: 0,
  },
  setDefaultHuman: (d: { gender: 'male' | 'female'; units: 'metric' | 'imperial'; height: number; weight: number; muscle: number }) => set({ defaultHuman: d }),

  // DXF scaling controls how coordinates are scaled when importing/exporting DXF files.
  // Defaults are loaded from config in `src/config/dxfConfig.ts`.
  dxfScale: DXF_CONFIG.dxfScale,
  setDxfScale: (scale) => set({ dxfScale: scale }),

  // DXF simplification settings
  dxfSimplifyEnabled: DXF_CONFIG.dxfSimplifyEnabled,
  dxfSimplifyTolerance: DXF_CONFIG.dxfSimplifyTolerance,
  setDxfSimplify: (enabled: boolean) => set({ dxfSimplifyEnabled: enabled }),
  setDxfSimplifyTolerance: (tolerance: number) => set({ dxfSimplifyTolerance: tolerance }),

  // tolerance in editor units for matching seam endpoints to path segments during DXF import
  dxfSeamMatchTolerance: DXF_CONFIG.dxfSeamMatchTolerance,
  setDxfSeamMatchTolerance: (tolerance: number) => set({ dxfSeamMatchTolerance: tolerance }),
});
