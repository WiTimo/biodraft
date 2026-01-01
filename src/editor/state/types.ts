import type { StateCreator } from 'zustand';

export interface Handle {
  dx: number;
  dy: number;
}

export interface Point {
  id: string;
  x: number;
  y: number;
  handleIn: Handle;
  handleOut: Handle;
  // optional seam allowance (in millimeters) for the edge from this point to the next point
  seamRespectMm?: number;
}

export interface PathTexture {
  src: string;
  scaleX?: number;
  scaleY?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  repeat?: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
}

export interface Path {
  id: string;
  points: Point[];
  closed: boolean;
  texture?: PathTexture | null;
}

export interface BackgroundImage {
  id: string;
  src: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  nativeWidth?: number;
  nativeHeight?: number;
}

export type Segment = [string, string];
export type SegmentSeam = [Segment, Segment] | [SegmentPortion, SegmentPortion];

// For drag-based seaming: segment with start/end positions (t values from 0-1)
export interface SegmentPortion {
  segment: Segment;
  tStart: number; // 0-1 parametric position along the curve
  tEnd: number;   // 0-1 parametric position along the curve
}

export interface CanvasPresent {
  paths: Path[];
  backgroundImages: BackgroundImage[];
  seams: SegmentSeam[];
}

export type Tool = 'pen' | 'background' | 'select' | 'seam' | 'texture';

export interface HistorySlice {
  present: CanvasPresent;
  past: CanvasPresent[];
  future: CanvasPresent[];
  saveState: () => void;
  undo: () => void;
  redo: () => void;
  resetCanvas: () => void;
  // Clear the canvas without reloading the page (used for soft resets like regenerating default human)
  clearCanvas: (preserveManImages?: boolean) => void;
  cleanupEmptyPaths: () => void;
}

export interface ToolSlice {
  currentPathId: string | null;
  currentTool: Tool;
  setTool: (tool: Tool) => void;
  // When true, the canvas should suppress global zoom and pan while
  // the user is interacting with a texture overlay (hovering/dragging)
  textureInteractionActive: boolean;
  setTextureInteractionActive: (active: boolean) => void;

  // Timestamp (ms) of the most recent texture interaction (mousedown/wheel/drag).
  // Used to suppress stage zoom for a short debounce window after texture events.
  textureLastInteractionAt: number;
  setTextureLastInteractionAt: (t: number) => void;
}

export interface ViewportSlice {
  zoom: number;
  setZoom: (zoom: number) => void;
  offset: { x: number; y: number };
  setOffset: (offset: { x: number; y: number }) => void;
  threeDEnabled: boolean;
  toggle3D: () => void;
  splitWidth: number;
  setSplitWidth: (width: number) => void;
  cameraPos: { x: number; y: number; z: number };
  setCameraPos: (pos: { x: number; y: number; z: number }) => void;
  cameraTarget: { x: number; y: number; z: number };
  setCameraTarget: (target: { x: number; y: number; z: number }) => void;
  isShiftPressed: boolean;
  setIsShiftPressed: (value: boolean) => void;
  isAltPressed: boolean;
  setIsAltPressed: (value: boolean) => void;
  isSimulationMode: boolean;
  setIsSimulationMode: (value: boolean) => void;
  manImageCenters: Record<string, { x: number; y: number }>;
  setManImageCenter: (id: string, center: { x: number; y: number }) => void;

  // Rulers & Grid visibility
  showLeftRuler: boolean;
  setShowLeftRuler: (v: boolean) => void;
  showTopRuler: boolean;
  setShowTopRuler: (v: boolean) => void;
  gridEnabled: boolean;
  setGridEnabled: (v: boolean) => void;

  // Theme (light / dark / follow system)
  theme: 'light' | 'dark' | 'system';
  setTheme: (t: 'light' | 'dark' | 'system') => void;

  // Interface language
  language: import('../../config/languages').LanguageCode;
  setLanguage: (lang: import('../../config/languages').LanguageCode) => void;

  // Units used for rulers and human params
  units: 'metric' | 'imperial';
  setUnits: (u: 'metric' | 'imperial') => void;
  metricUnit: 'cm' | 'mm';
  setMetricUnit: (u: 'cm' | 'mm') => void;

  // Default human used when clearing canvas
  defaultHuman: {
    gender: 'male' | 'female';
    units: 'metric' | 'imperial';
    height: number;
    weight: number;
    muscle: number;
  };
  setDefaultHuman: (d: { gender: 'male' | 'female'; units: 'metric' | 'imperial'; height: number; weight: number; muscle: number }) => void;

  // DXF import/export scale factor: number of file units per editor unit.
  // For example, dxfScale = 100 means exported DXF coordinates are 100x the editor coords.
  dxfScale: number;
  setDxfScale: (scale: number) => void;

  // DXF import simplification options
  dxfSimplifyEnabled: boolean; // whether to run simplification on import
  dxfSimplifyTolerance: number; // tolerance in editor units for Ramer-Douglas-Peucker

  // seam matching tolerance (editor units) used to snap DXF seam endpoints to path segments
  dxfSeamMatchTolerance: number;
  setDxfSeamMatchTolerance: (tolerance: number) => void;
}

export interface BackgroundSlice {
  selectedBackgroundId: string | null;
  addBackgroundImage: (src: string, id?: string, nativeWidth?: number, nativeHeight?: number) => void;
  moveBackgroundImage: (id: string, x: number, y: number) => void;
  scaleBackgroundImage: (id: string, scale: number) => void;
  rotateBackgroundImage: (id: string, rotation: number) => void;
  toggleLockBackgroundImage: (id: string) => void;
  selectBackgroundImage: (id: string) => void;
  deselectBackgroundImages: () => void;
  updateBackgroundImageTransform: (id: string, transform: { scaleX: number; scaleY: number; rotation: number }) => void;
  updateBackgroundImageFullTransform: (id: string, transform: { x: number; y: number; scaleX: number; scaleY: number; rotation: number }) => void;
  deleteSelectedBackgroundImage: () => void;
  removeBackgroundImage: (id: string) => void;
}

export interface PointSlice {
  addPoint: (x: number, y: number, sharp?: boolean) => string;
  finishCurrentPath: () => void;
  movePoint: (id: string, x: number, y: number) => void;
  updatePointsBatch: (updates: Array<{ id: string; x?: number; y?: number; handleIn?: Handle; handleOut?: Handle }>) => void;
  moveHandle: (
    pointId: string,
    type: 'handleIn' | 'handleOut',
    dx: number,
    dy: number,
    save?: boolean,
    altPressed?: boolean
  ) => void;
  toggleHandlesForPoint: (id: string) => void;
  startHandleMove: (pointId: string) => void;
  endHandleMove: () => void;
  justPlacedPointId: string | null;
  clearJustPlacedPointId: () => void;
  isDraggingHandle: boolean;
}

export interface SelectionSlice {
  selectionRect: { x: number; y: number; width: number; height: number } | null;
  selectionStart: { x: number; y: number } | null;
  setSelectionRect: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  setSelectionStart: (start: { x: number; y: number } | null) => void;
  selectedPointId: string | null;
  selectPoint: (id: string) => void;
  deselectPoint: () => void;
  selectedPointIds: string[];
  setSelectedPointIds: (ids: string[]) => void;
  clearSelectedPointIds: () => void;

  // Hovered path (pattern) id for tool-specific UI (e.g. texture hover inspector)
  hoveredPathId: string | null;
  setHoveredPathId: (id: string | null) => void;

  // Sticky path selection for the texture inspector (set via click in texture tool)
  textureInspectPathId: string | null;
  setTextureInspectPathId: (id: string | null) => void;

  deleteSelectedPoint: () => void;
  deleteSelectedPoints: () => void;
  mousePosition: { x: number; y: number } | null;
  setMousePosition: (pos: { x: number; y: number } | null) => void;
  snapGuides: { x: number | null; y: number | null };
  setSnapGuides: (guides: { x: number | null; y: number | null }) => void;
}

export interface ClipboardSlice {
  clipboard: Path[] | null;
  setClipboard: (paths: Path[]) => void;
  copySelectedPoints: () => void;
  pasteClipboardPoints: () => void;
}

export interface SeamSlice {
  seams: SegmentSeam[];
  addSeam: (seg1: Segment, seg2: Segment) => void;
  removeSeam: (seg1: Segment, seg2: Segment) => void;
  isSeam: (seg1: Segment, seg2: Segment) => boolean;
  addPathSeam: (seg1: Segment, seg2: Segment) => void;
  seamSelection: Segment[];
  setSeamSelection: (selection: Segment[]) => void;
  selectedSeamSegment: Segment | null;
  setSelectedSeamSegment: (segment: Segment | null) => void;
  seamDeleteMode: boolean;
  setSeamDeleteMode: (active: boolean) => void;
  swapSeam: (segment: Segment) => void;
  swapSeamPortion: (seamIndex: number) => void;
  // Drag-based seaming
  pendingSeamPortion1: SegmentPortion | null;
  pendingSeamPortion2: SegmentPortion | null;
  setPendingSeamPortion1: (portion: SegmentPortion | null) => void;
  setPendingSeamPortion2: (portion: SegmentPortion | null) => void;
  clearPendingSeamPortions: () => void;
  commitPendingSeamPortions: () => void;
}

export interface TextureSlice {
  setTextureForPath: (pathId: string, texture: PathTexture | null) => void;
  clearTextureForPath: (pathId: string) => void;
  setTextureForSelectedPaths: (texture: PathTexture | null) => void;
  updateTextureForPathLive: (pathId: string, partial: Partial<PathTexture>) => void;
  updateTextureForPath: (pathId: string, partial: Partial<PathTexture>) => void;
}

export type CanvasState = HistorySlice &
  ToolSlice &
  ViewportSlice &
  BackgroundSlice &
  PointSlice &
  SelectionSlice &
  ClipboardSlice &
  SeamSlice &
  TextureSlice;

export type CanvasStateCreator<T> = StateCreator<
  CanvasState,
  [['zustand/persist', unknown]],
  [],
  T
>;