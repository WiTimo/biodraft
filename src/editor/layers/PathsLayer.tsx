import { Line, Group } from 'react-konva';

import { LinePath } from '../components/LinePath';
import { useCanvasState } from '../state/CanvasState';
import type { Handle, Point, Segment, Path } from '../state/types';
import type { Line as KonvaLine } from 'konva/lib/shapes/Line';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { ReactElement } from 'react';
import { evaluateBezier, generateBezierPoints, segmentsEqual } from '../state/utils';

const seamPartToSegment = (part: any): Segment => part.segment || part;

const SEAM_DRAG_SAMPLE_STEP = 0.005;
const CLICK_MOVE_THRESHOLD_PX = 3;
const MIN_PORTION_LENGTH = 0.05;

function getWorldPosFromStagePointer(pointer: { x: number; y: number }, offset: { x: number; y: number }, zoom: number) {
  return {
    x: (pointer.x - offset.x) / zoom,
    y: (pointer.y - offset.y) / zoom,
  };
}

function buildClosedPathSampledPoints(points: Point[], stepsPerSegment = 20): number[] {
  const sampled: number[] = [];
  if (points.length < 2) return sampled;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    sampled.push(...generateBezierPoints(a, a.handleOut, b.handleIn, b, stepsPerSegment));
  }
  // close
  const a = points[points.length - 1];
  const b = points[0];
  sampled.push(...generateBezierPoints(a, a.handleOut, b.handleIn, b, stepsPerSegment));
  return sampled;
}

function getPreviewPointsForPortion(p0: Point, h0: Handle, h1: Handle, p1: Point, tStart: number, tEnd: number): number[] {
  const points: number[] = [];
  const tMin = Math.min(tStart, tEnd);
  const tMax = Math.max(tStart, tEnd);
  const numSteps = Math.max(10, Math.ceil((tMax - tMin) * 100));

  for (let i = 0; i <= numSteps; i++) {
    const t = tMin + (i / numSteps) * (tMax - tMin);
    const { x, y } = evaluateBezier(p0, h0, h1, p1, t);
    points.push(x, y);
  }
  return points;
}

function getSegmentOverlayColor(opts: {
  currentTool: string;
  isSelected: boolean;
  isDraggingThis: boolean;
  isPending1: boolean;
  isPending2: boolean;
}) {
  const { currentTool, isSelected, isDraggingThis, isPending1, isPending2 } = opts;
  if (isDraggingThis) return 'rgba(0,255,0,0.3)';
  if (isPending1) return 'rgba(255,150,0,0.3)';
  if (isPending2) return 'rgba(0,150,255,0.3)';
  if (isSelected) return 'rgba(0,0,255,0.5)';
  if (currentTool === 'seam') return 'rgba(0,0,255,0.05)';
  return 'transparent';
}

export function PathsLayer() {
  const paths = useCanvasState(s => s.present.paths);
  const seams = useCanvasState(s => s.present.seams || []);
  const currentTool = useCanvasState(s => s.currentTool);
  const zoom = useCanvasState(s => s.zoom);
  const offset = useCanvasState(s => s.offset);
  const selectedSegment = useCanvasState(s => s.selectedSeamSegment);
  const setSelectedSeamSegment = useCanvasState(s => s.setSelectedSeamSegment);
  const saveState = useCanvasState(s => s.saveState);
  
  // Drag-based seaming state
  const pendingSeamPortion1 = useCanvasState(s => s.pendingSeamPortion1);
  const pendingSeamPortion2 = useCanvasState(s => s.pendingSeamPortion2);
  const setPendingSeamPortion1 = useCanvasState(s => s.setPendingSeamPortion1);
  const setPendingSeamPortion2 = useCanvasState(s => s.setPendingSeamPortion2);
  const clearPendingSeamPortions = useCanvasState(s => s.clearPendingSeamPortions);
  const commitPendingSeamPortions = useCanvasState(s => s.commitPendingSeamPortions);

  const hoveredPathId = useCanvasState((s) => s.hoveredPathId);
  const setHoveredPathId = useCanvasState((s) => s.setHoveredPathId);
  const textureInspectPathId = useCanvasState((s) => s.textureInspectPathId);

  // Local drag state
  const [isDraggingSeam, setIsDraggingSeam] = useState(false);
  const [dragStartT, setDragStartT] = useState<number>(0);
  const [dragCurrentT, setDragCurrentT] = useState<number>(0);
  const [dragSegment, setDragSegment] = useState<Segment | null>(null);
  const dragSegmentPointsRef = useRef<{ p0: Point; p1: Point; h0: Handle; h1: Handle } | null>(null);
  const stageRef = useRef<any>(null);
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);
  const [hasMoved, setHasMoved] = useState(false);

  // Texture-drag state for texture-select tool
  const updateTextureForPathLive = useCanvasState(s => s.updateTextureForPathLive);
  const [isDraggingTexture, setIsDraggingTexture] = useState(false);
  const [textureDragPathId, setTextureDragPathId] = useState<string | null>(null);
  const [textureDragStart, setTextureDragStart] = useState<{ x: number; y: number } | null>(null);
  const [textureDragOriginalOffset, setTextureDragOriginalOffset] = useState<{ x: number; y: number } | null>(null);
  const [textureStageRef, setTextureStageRef] = useState<any>(null);
  const lastTextureWheelSaveAtRef = useRef<number>(0);

  // Helper to calculate t value (0-1) along a bezier curve from mouse position
  const calculateTFromMouse = useCallback((mouseX: number, mouseY: number, p0: Point, h0: Handle, h1: Handle, p1: Point) => {
    // Find closest point on curve by sampling
    let closestT = 0;
    let closestDist = Infinity;
    
    for (let t = 0; t <= 1; t += SEAM_DRAG_SAMPLE_STEP) {
      const { x, y } = evaluateBezier(p0, h0, h1, p1, t);
      const dist = Math.sqrt((x - mouseX) ** 2 + (y - mouseY) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closestT = t;
      }
    }
    
    return closestT;
  }, []);

  // Handle global mouse move and up
  useEffect(() => {
    if (!isDraggingSeam) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!stageRef.current || !dragSegmentPointsRef.current) return;
      
      const stage = stageRef.current;
      const stageBounds = stage.container().getBoundingClientRect();
      
      // Convert screen coordinates to stage coordinates, then to world coordinates
      const stageX = e.clientX - stageBounds.left;
      const stageY = e.clientY - stageBounds.top;
      const worldX = (stageX - offset.x) / zoom;
      const worldY = (stageY - offset.y) / zoom;
      
      // Check if mouse has moved significantly (more than 3 pixels)
      if (mouseDownPos) {
        const dx = Math.abs(e.clientX - mouseDownPos.x);
        const dy = Math.abs(e.clientY - mouseDownPos.y);
        if (dx > CLICK_MOVE_THRESHOLD_PX || dy > CLICK_MOVE_THRESHOLD_PX) {
          setHasMoved(true);
        }
      }
      
      const { p0, p1, h0, h1 } = dragSegmentPointsRef.current;
      const t = calculateTFromMouse(worldX, worldY, p0, h0, h1, p1);
      setDragCurrentT(t);
    };

    const handleMouseUp = () => {
      if (!dragSegment) return;
      
      // If mouse hasn't moved, treat it as a click for full-path seaming
      if (!hasMoved) {
        // Full path seaming (old behavior)
        if (!pendingSeamPortion1) {
          // First selection - select entire segment (0 to 1)
          setPendingSeamPortion1({
            segment: dragSegment,
            tStart: 0,
            tEnd: 1,
          });
        } else if (!pendingSeamPortion2) {
          // Second selection - create seam with entire segment
          setPendingSeamPortion2({
            segment: dragSegment,
            tStart: 0,
            tEnd: 1,
          });
          setTimeout(() => commitPendingSeamPortions(), 0);
        } else {
          // Already have two portions, clear and start fresh
          clearPendingSeamPortions();
          setPendingSeamPortion1({
            segment: dragSegment,
            tStart: 0,
            tEnd: 1,
          });
        }
      } else {
        // Mouse has moved - partial seaming
        const tStart = Math.min(dragStartT, dragCurrentT);
        const tEnd = Math.max(dragStartT, dragCurrentT);
        
        // Only create portion if there's meaningful selection (> 5% of segment)
        if (Math.abs(tEnd - tStart) > MIN_PORTION_LENGTH) {
          const portion = {
            segment: dragSegment,
            tStart,
            tEnd,
          };
          
          if (!pendingSeamPortion1) {
            setPendingSeamPortion1(portion);
          } else if (!pendingSeamPortion2) {
            setPendingSeamPortion2(portion);
            setTimeout(() => commitPendingSeamPortions(), 0);
          } else {
            clearPendingSeamPortions();
            setPendingSeamPortion1(portion);
          }
        }
      }
      
      setIsDraggingSeam(false);
      setDragSegment(null);
      dragSegmentPointsRef.current = null;
      stageRef.current = null;
      setMouseDownPos(null);
      setHasMoved(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSeam, dragSegment, dragStartT, dragCurrentT, pendingSeamPortion1, pendingSeamPortion2,
      setPendingSeamPortion1, setPendingSeamPortion2, clearPendingSeamPortions, commitPendingSeamPortions, 
      calculateTFromMouse, zoom, offset, mouseDownPos, hasMoved]);

  // Handle texture drag global mouse events
  useEffect(() => {
    if (!isDraggingTexture || !textureStageRef || !textureDragPathId || !textureDragStart || !textureDragOriginalOffset) return;

    const handleMouseMove = (e: MouseEvent) => {
      const stage = textureStageRef;
      const stageBounds = stage.container().getBoundingClientRect();
      const stageX = e.clientX - stageBounds.left;
      const stageY = e.clientY - stageBounds.top;
      const worldX = (stageX - offset.x) / zoom;
      const worldY = (stageY - offset.y) / zoom;

      const dx = worldX - textureDragStart.x;
      const dy = worldY - textureDragStart.y;

      // Invert direction so dragging feels natural (dragging right moves texture to the right)
      updateTextureForPathLive(textureDragPathId, {
        offsetX: textureDragOriginalOffset.x - dx,
        offsetY: textureDragOriginalOffset.y - dy,
      });
    };

    const handleMouseUp = () => {
      if (textureStageRef && textureStageRef.container) {
        textureStageRef.container().style.cursor = 'default';
      }
      setIsDraggingTexture(false);
      setTextureDragPathId(null);
      setTextureDragStart(null);
      setTextureDragOriginalOffset(null);
      setTextureStageRef(null);

      // clear texture interaction flag so stage zoom resumes
      useCanvasState.getState().setTextureInteractionActive(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTexture, textureStageRef, textureDragPathId, textureDragStart, textureDragOriginalOffset, updateTextureForPathLive, zoom, offset]);


  const renderFillOverlay = (path: Path) => {
    if (!path.closed) return null;
    if (currentTool !== 'select' && currentTool !== 'texture') return null;

    const sampled = buildClosedPathSampledPoints(path.points, 20);

    return (
      <Line
        key={`fill-overlay-${path.id}`}
        name={`fill-overlay`}
        points={sampled}
        closed
        fill={hoveredPathId === path.id ? 'rgba(0,120,255,0.06)' : 'rgba(0,0,0,0.001)'}
        strokeWidth={0}
        listening={true}
        onMouseEnter={(e) => {
          setHoveredPathId(path.id);
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'pointer';

          if (currentTool === 'texture') {
            const state = useCanvasState.getState();
            state.setTextureInteractionActive(true);
            state.setTextureLastInteractionAt(Date.now());
          }
        }}
        onMouseLeave={(e) => {
          if (hoveredPathId === path.id) setHoveredPathId(null);
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'default';

          if (currentTool === 'texture' && !isDraggingTexture) {
            useCanvasState.getState().setTextureInteractionActive(false);
          }
        }}
        onMouseDown={(e) => {
          if (currentTool === 'select') {
            const ids = path.points.map((p) => p.id);
            const state = useCanvasState.getState();
            if (ids.length === 1) {
              state.selectPoint(ids[0]);
            } else {
              state.setSelectedPointIds(ids);
              state.deselectPoint();
            }
            return;
          }

          if (currentTool === 'texture') {
            // Sticky selection for the bottom-left inspector.
            // Clicking the same pattern again toggles it off.
            const state = useCanvasState.getState();
            state.setTextureInspectPathId(state.textureInspectPathId === path.id ? null : path.id);

            e.evt.preventDefault();
            const stage = e.target.getStage();
            if (!stage) return;
            const pointer = stage.getPointerPosition();
            if (!pointer) return;

            const { offsetX = 0, offsetY = 0 } = path.texture ?? {};
            const world = getWorldPosFromStagePointer(pointer, offset, zoom);

            // Create a single undo step for the whole drag gesture.
            saveState();

            setIsDraggingTexture(true);
            setTextureDragPathId(path.id);
            setTextureDragStart({ x: world.x, y: world.y });
            setTextureDragOriginalOffset({ x: offsetX, y: offsetY });

            setTextureStageRef(stage);
            stage.container().style.cursor = 'grabbing';

            state.setTextureInteractionActive(true);
            state.setTextureLastInteractionAt(Date.now());
          }
        }}
        onWheel={(e) => {
          if (currentTool !== 'texture') return;
          if (!e.evt.ctrlKey && !e.evt.metaKey) return;

          e.evt.preventDefault();
          try {
            if (e.evt.stopImmediatePropagation) e.evt.stopImmediatePropagation();
            if (e.evt.stopPropagation) e.evt.stopPropagation();
            (e as any).cancelBubble = true;
          } catch {
            // ignore
          }

          const stage = e.target.getStage();
          if (!stage) return;
          const pointer = stage.getPointerPosition();
          if (!pointer) return;

          useCanvasState.getState().setTextureLastInteractionAt(Date.now());

          // Ctrl+wheel fires many events; record a single undo snapshot per wheel burst.
          const now = Date.now();
          if (now - lastTextureWheelSaveAtRef.current > 400) {
            saveState();
            lastTextureWheelSaveAtRef.current = now;
          }

          const delta = e.evt.deltaY;
          const sensitivity = 0.0015;
          const rawFactor = Math.exp(-delta * sensitivity);
          const factor = Math.max(0.01, Math.min(100, rawFactor));

          const curScaleX = path.texture?.scaleX ?? 1;
          const curScaleY = path.texture?.scaleY ?? 1;
          const newScaleX = Math.max(0.01, curScaleX * factor);
          const newScaleY = Math.max(0.01, curScaleY * factor);

          const world = getWorldPosFromStagePointer(pointer, offset, zoom);
          const oldOffsetX = path.texture?.offsetX ?? 0;
          const oldOffsetY = path.texture?.offsetY ?? 0;

          const adjustedOffsetX = (oldOffsetX - world.x) * (newScaleX / curScaleX) + world.x;
          const adjustedOffsetY = (oldOffsetY - world.y) * (newScaleY / curScaleY) + world.y;

          updateTextureForPathLive(path.id, {
            scaleX: newScaleX,
            scaleY: newScaleY,
            offsetX: adjustedOffsetX,
            offsetY: adjustedOffsetY,
          });
        }}
        onMouseUp={() => {
          // Drag end handled by global mouseup
        }}
      />
    );
  };

  const renderSeamSelectableSegments = () => {
    return paths.flatMap((path) => {
      const elements: ReactElement[] = [];

      const addSegmentElement = (a: Point, b: Point, isClosing = false) => {
        const segment: Segment = [a.id, b.id];

        const isSelected = selectedSegment ? segmentsEqual(selectedSegment, segment) : false;
        const isDraggingThis = dragSegment ? segmentsEqual(dragSegment, segment) : false;

        const isPending1 = pendingSeamPortion1 ? segmentsEqual(pendingSeamPortion1.segment, segment) : false;
        const isPending2 = pendingSeamPortion2 ? segmentsEqual(pendingSeamPortion2.segment, segment) : false;

        const baseColor = getSegmentOverlayColor({
          currentTool,
          isSelected,
          isDraggingThis,
          isPending1,
          isPending2,
        });

        elements.push(
          <Line
            key={`bezier-click-${isClosing ? 'close-' : ''}${a.id}-${b.id}`}
            points={generateBezierPoints(a, a.handleOut, b.handleIn, b)}
            stroke={baseColor}
            strokeWidth={12 / zoom}
            name="seam-segment"
            onMouseDown={(e) => {
              if (currentTool !== 'seam') return;
              e.evt.preventDefault();

              const state = useCanvasState.getState();

              if (state.seamDeleteMode) {
                const seamToRemove = seams.find(([partA, partB]) => {
                  const segA = seamPartToSegment(partA as any);
                  const segB = seamPartToSegment(partB as any);
                  return segmentsEqual(segA, segment) || segmentsEqual(segB, segment);
                });

                if (seamToRemove) {
                  const [partA, partB] = seamToRemove;
                  state.removeSeam(seamPartToSegment(partA as any), seamPartToSegment(partB as any));
                  state.setSeamSelection([]);
                  setSelectedSeamSegment(null);
                }

                state.setSeamDeleteMode(false);
                return;
              }

              const stage = e.target.getStage();
              if (!stage) return;

              const pointerPos = stage.getPointerPosition();
              if (!pointerPos) return;

              setMouseDownPos({ x: e.evt.clientX, y: e.evt.clientY });
              setHasMoved(false);

              const world = getWorldPosFromStagePointer(pointerPos, offset, zoom);
              const t = calculateTFromMouse(world.x, world.y, a, a.handleOut, b.handleIn, b);

              setIsDraggingSeam(true);
              setDragSegment(segment);
              stageRef.current = stage;
              dragSegmentPointsRef.current = { p0: a, p1: b, h0: a.handleOut, h1: b.handleIn };
              setDragStartT(t);
              setDragCurrentT(t);
            }}
            onClick={() => {
              // drag-based seaming only
            }}
            onContextMenu={(e) => {
              if (currentTool !== 'seam') return;
              e.evt.preventDefault();

              const normalize = ([id1, id2]: [string, string]) => [id1, id2].sort() as [string, string];
              const target = normalize([a.id, b.id]);
              const state = useCanvasState.getState();

              const isUsedInSeam = seams.some((seam) => {
                const portion1 = seam[0] as any;
                const portion2 = seam[1] as any;
                const seg1 = normalize((portion1.segment || portion1) as [string, string]);
                const seg2 = normalize((portion2.segment || portion2) as [string, string]);
                return (seg1[0] === target[0] && seg1[1] === target[1]) || (seg2[0] === target[0] && seg2[1] === target[1]);
              });

              if (!isUsedInSeam) return;

              for (const seam of seams) {
                const portion1 = seam[0] as any;
                const portion2 = seam[1] as any;
                const seg1 = normalize((portion1.segment || portion1) as [string, string]);
                const seg2 = normalize((portion2.segment || portion2) as [string, string]);
                if ((seg1[0] === target[0] && seg1[1] === target[1]) || (seg2[0] === target[0] && seg2[1] === target[1])) {
                  const s1 = (portion1.segment || portion1) as [string, string];
                  const s2 = (portion2.segment || portion2) as [string, string];
                  state.removeSeam(s1, s2);
                  state.setSeamSelection([]);
                  setSelectedSeamSegment(null);
                  break;
                }
              }
            }}
            onMouseEnter={(e) => {
              if (currentTool !== 'seam') return;

              setSelectedSeamSegment(segment);
              const state = useCanvasState.getState();
              if (isSelected) return;

              const line = e.target as KonvaLine;
              if (state.seamDeleteMode) {
                line.stroke('rgba(230,67,67,0.6)');
                line.strokeWidth(16 / zoom);
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = 'pointer';
              } else {
                line.stroke('rgba(0,0,255,0.2)');
              }
              e.target.getLayer()?.batchDraw();
            }}
            onMouseLeave={(e) => {
              if (currentTool !== 'seam') return;

              setSelectedSeamSegment(null);
              if (!isSelected) {
                const line = e.target as KonvaLine;
                line.stroke(baseColor);
                line.strokeWidth(12 / zoom);
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = 'default';
              }
              e.target.getLayer()?.batchDraw();
            }}
            listening={currentTool === 'seam'}
          />
        );
      };

      for (let i = 0; i < path.points.length - 1; i++) {
        addSegmentElement(path.points[i], path.points[i + 1]);
      }
      if (path.closed && path.points.length >= 2) {
        addSegmentElement(path.points[path.points.length - 1], path.points[0], true);
      }

      return elements;
    });
  };

  const renderDragPreview = () => {
    if (!isDraggingSeam || !dragSegment || !dragSegmentPointsRef.current || !hasMoved) return null;
    const { p0, p1, h0, h1 } = dragSegmentPointsRef.current;
    const previewPoints = getPreviewPointsForPortion(p0, h0, h1, p1, dragStartT, dragCurrentT);
    return (
      <Line
        points={previewPoints}
        stroke={pendingSeamPortion1 ? 'rgba(0,150,255,0.8)' : 'rgba(255,150,0,0.8)'}
        strokeWidth={4 / zoom}
        listening={false}
      />
    );
  };

  return (
    <>
      {/* Render all actual paths visually */}
      {paths.map((path) => (
        <Group key={path.id}>
          <LinePath
            key={`linepath-${path.id}`}
            points={path.points}
            closed={path.closed}
            texture={path.texture ?? null}
            highlighted={
              path.closed &&
              ((hoveredPathId === path.id && (currentTool === 'select' || currentTool === 'texture')) ||
                (currentTool === 'texture' && textureInspectPathId === path.id))
            }
            highlightColor={
              currentTool === 'texture' && hoveredPathId === path.id
                ? 'rgba(230,67,67,0.75)'
                : undefined
            }
          />

          {/* Invisible overlay to capture hover/click for selection (works reliably across Konva shapes) */}
          {renderFillOverlay(path as any)}
        </Group>
      ))}

      {currentTool === 'seam' ? renderSeamSelectableSegments() : null}

      {/* Preview line during drag */}
      {renderDragPreview()}

    </>
  );
}
