import { useCallback, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Line } from 'react-konva';
import Konva from 'konva';

import { BackgroundImage } from '../BackgroundImage/BackgroundImage';
import { GridLayer } from '../Layers/GridLayer';
import { PathsLayer } from '../Layers/PathsLayer';
import { getStep } from '../util/grid';
import { PointsLayer } from '../Layers/PointsLayer';
import { SelectionTransformer } from '../Layers/SelectionTransformer';
import { PenSegmentPreview } from '../Previews/PenSegmentPreview';
import { SeamLayer } from '../Layers/SeamLayer';
import { useCanvasState } from '../state/CanvasState';

const MM_PER_WORLD_UNIT = 10;

interface CanvasStageProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  isSpacePressed: boolean;
  isPanning: boolean;
  setIsPanning: (value: boolean) => void;
  width: number;
  height: number;
}

export function CanvasStage({ stageRef, isSpacePressed, isPanning, setIsPanning, width, height }: CanvasStageProps) {
  const present = useCanvasState((state) => state.present);
  const currentTool = useCanvasState((state) => state.currentTool);
  const zoom = useCanvasState((state) => state.zoom);
  const offset = useCanvasState((state) => state.offset);
  const setOffset = useCanvasState((state) => state.setOffset);
  const deselectBackgroundImages = useCanvasState((state) => state.deselectBackgroundImages);
  const addPoint = useCanvasState((state) => state.addPoint);
  const finishCurrentPath = useCanvasState((state) => state.finishCurrentPath);
  const moveHandle = useCanvasState((state) => state.moveHandle);
  const selectionRect = useCanvasState((state) => state.selectionRect);
  const selectionStart = useCanvasState((state) => state.selectionStart);
  const setSelectionRect = useCanvasState((state) => state.setSelectionRect);
  const setSelectionStart = useCanvasState((state) => state.setSelectionStart);
  const selectedPointIds = useCanvasState((state) => state.selectedPointIds);
  const snapGuides = useCanvasState((state) => state.snapGuides);
  const setSnapGuides = useCanvasState((state) => state.setSnapGuides);
  const setMousePosition = useCanvasState((state) => state.setMousePosition);
  const deselectPoint = useCanvasState((state) => state.deselectPoint);
  const clearSelectedPointIds = useCanvasState((state) => state.clearSelectedPointIds);
  const setSeamSelection = useCanvasState((state) => state.setSeamSelection);
  const setSelectedSeamSegment = useCanvasState((state) => state.setSelectedSeamSegment);
  const setSeamDeleteMode = useCanvasState((state) => state.setSeamDeleteMode);

  const [isDraggingNewPoint, setIsDraggingNewPoint] = useState(false);
  const [newPointId, setNewPointId] = useState<string | null>(null);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);
  const pendingSelectionStart = useRef<{ x: number; y: number } | null>(null);

  const { backgroundImages, paths } = present;

  const toWorld = useCallback(
    (pointer: { x: number; y: number }) => ({
      x: (pointer.x - offset.x) / zoom,
      y: (pointer.y - offset.y) / zoom,
    }),
    [offset, zoom],
  );

  const stageCursor = useMemo(() => {
    if (isPanning) return 'grabbing';
    if (isSpacePressed) return 'grab';
    if (currentTool === 'pen') return 'url(/cursors/pen.svg) 0 0, auto';
    if (currentTool === 'select') return 'url(/cursors/select.svg) 8 4, auto';
    if (currentTool === 'texture') return 'url(/cursors/select.svg) 8 4, auto';
    return 'default';
  }, [currentTool, isPanning, isSpacePressed]);

  const handleMouseDown = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = event.target.getStage();
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const isMiddleMouse = event.evt.button === 1;
      const shouldPan = isMiddleMouse || isSpacePressed;

      if (shouldPan) {
        setIsPanning(true);
        setLastPointerPos(pointer);
        document.body.style.cursor = 'grabbing';
        return;
      }

      const target = event.target;
      const targetName = target.name();
      const worldPosition = toWorld(pointer);
      const state = useCanvasState.getState();

      if (targetName?.includes('transform-handle')) return;

      const isStageClick = target === stage;
      const isBackgroundClick = targetName === 'background-image';

      if (currentTool === 'background') {
        if (isStageClick || isBackgroundClick) {
          deselectBackgroundImages();
          state.deselectPoint();
        }
        return;
      }

      if (currentTool === 'seam') {
        const clickedOutsideSegment = !targetName?.includes('seam-segment');
        if (clickedOutsideSegment) {
          setSeamSelection([]);
          setSelectedSeamSegment(null);
          setSeamDeleteMode(false);
        }
        return;
      }

      if (currentTool === 'select') {
        const isClickingOnEmpty = isStageClick || targetName === '';
        const pointerRect = selectionRect;
        const clickedInsideBox =
          pointerRect &&
          pointer.x >= pointerRect.x &&
          pointer.x <= pointerRect.x + pointerRect.width &&
          pointer.y >= pointerRect.y &&
          pointer.y <= pointerRect.y + pointerRect.height;

        if (isClickingOnEmpty && !clickedInsideBox) {
          pendingSelectionStart.current = worldPosition;
          setSelectionRect(null);
          clearSelectedPointIds();
          deselectPoint();
        }
        return;
      }

      if (currentTool === 'pen') {
        const isRightClick = event.evt.button === 2;
        if (isRightClick) {
          // Prevent placing a point on right-click; instead finish the current path
          event.evt.preventDefault();
          finishCurrentPath();
          return;
        }

        const isClickingOnPoint = targetName === 'point';
        
        // Check for double-click first, before processing anything
        if (event.evt.detail === 2) {
          // Special case: if double-clicking on the first point of current path, close it
          if (isClickingOnPoint && state.currentPathId) {
            const currentPath = paths.find(p => p.id === state.currentPathId);
            if (currentPath && currentPath.points.length > 0) {
              const firstPoint = currentPath.points[0];
              const clickedPointId = target.id();
              
              if (clickedPointId === firstPoint.id) {
                finishCurrentPath();
                return;
              }
            }
          }
          // For any other double-click, just finish the path without adding a point
          finishCurrentPath();
          return;
        }

        if (isClickingOnPoint && state.currentPathId) {
          const currentPath = paths.find(p => p.id === state.currentPathId);
          if (currentPath && currentPath.points.length > 0) {
            const firstPoint = currentPath.points[0];
            const clickedPointId = target.id();
            
            // Single click on first point also closes the path
            if (clickedPointId === firstPoint.id) {
              finishCurrentPath();
              return;
            }
          }
        }

        // Allow clicking on points from other patterns to create overlapping points
        const canPlacePoint = isStageClick || targetName === 'background-image' || targetName === 'background' || isClickingOnPoint;
        
        if (!canPlacePoint) {
          return;
        }

        // If clicking on a point and ALT is NOT pressed, use its exact coordinates
        let finalX, finalY;
        if (isClickingOnPoint && !state.isAltPressed) {
          // Get the exact position of the clicked point
          finalX = target.x();
          finalY = target.y();
        } else if (state.isAltPressed) {
          // ALT overrides all other snapping: snap to the visible grid only
          const basePixelGridSize = 30; // same base size GridLayer uses
          const rawWorldStep = basePixelGridSize / zoom;
          const rawMmStep = rawWorldStep * MM_PER_WORLD_UNIT;
          const mmStep = getStep(rawMmStep);
          const worldStep = mmStep / MM_PER_WORLD_UNIT;
          finalX = Math.round(worldPosition.x / worldStep) * worldStep;
          finalY = Math.round(worldPosition.y / worldStep) * worldStep;
        } else {
          // Use snap guides if available
          const guides = state.snapGuides;
          finalX = guides.x ?? worldPosition.x;
          finalY = guides.y ?? worldPosition.y;
        }

        const pointId = addPoint(finalX, finalY, true);
        state.selectPoint(pointId);
        setNewPointId(pointId);
        setIsDraggingNewPoint(true);
      }
    },
    [
      addPoint,
      clearSelectedPointIds,
      currentTool,
      deselectBackgroundImages,
      deselectPoint,
      finishCurrentPath,
      isSpacePressed,
      selectionRect,
      setIsPanning,
      setSelectionRect,
      setSeamSelection,
      setSelectedSeamSegment,
      toWorld,
    ],
  );

  const handleMouseMove = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = event.target.getStage();
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      if (currentTool === 'pen') {
        const worldPosition = toWorld(pointer);
        const state = useCanvasState.getState();

        // If ALT is pressed, snap to the visible grid and show a guide
        if (state.isAltPressed) {
          const basePixelGridSize = 30;
          const rawWorldStep = basePixelGridSize / zoom;
          const rawMmStep = rawWorldStep * MM_PER_WORLD_UNIT;
          const mmStep = getStep(rawMmStep);
          const worldStep = mmStep / MM_PER_WORLD_UNIT;
          const snapX = Math.round(worldPosition.x / worldStep) * worldStep;
          const snapY = Math.round(worldPosition.y / worldStep) * worldStep;
          setSnapGuides({ x: snapX, y: snapY });
          return;
        }

        const SNAP_RADIUS = 15 / zoom; // Increased from 10 for easier snapping
        const allPoints = paths.flatMap((path) => path.points);

        let snapX: number | null = null;
        let snapY: number | null = null;
        let closestPoint: any = null;
        let minDistance = Infinity;

        // Find closest point within snap radius
        for (const point of allPoints) {
          const dx = worldPosition.x - point.x;
          const dy = worldPosition.y - point.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < SNAP_RADIUS && distance < minDistance) {
            minDistance = distance;
            closestPoint = point;
          }
        }

        // Snap to closest point if found (snap both X and Y together)
        if (closestPoint) {
          snapX = closestPoint.x;
          snapY = closestPoint.y;
        } else {
          // Otherwise, snap to individual axes like before
          for (const point of allPoints) {
            if (Math.abs(worldPosition.x - point.x) < SNAP_RADIUS) snapX = point.x;
            if (Math.abs(worldPosition.y - point.y) < SNAP_RADIUS) snapY = point.y;
          }
        }

        setSnapGuides({ x: snapX, y: snapY });
      }

      if (isPanning && lastPointerPos) {
        const dx = pointer.x - lastPointerPos.x;
        const dy = pointer.y - lastPointerPos.y;
        setOffset({ x: offset.x + dx, y: offset.y + dy });
        setLastPointerPos(pointer);
        return;
      }

      const worldPosition = toWorld(pointer);
      setMousePosition(worldPosition);

      if (currentTool === 'select' && pendingSelectionStart.current) {
        const dx = worldPosition.x - pendingSelectionStart.current.x;
        const dy = worldPosition.y - pendingSelectionStart.current.y;
        const distance = Math.hypot(dx, dy);

        if (!selectionStart && distance > 4) {
          setSelectionStart(pendingSelectionStart.current);
        }

        if (selectionStart || distance > 4) {
          setSelectionRect({
            x: pendingSelectionStart.current.x,
            y: pendingSelectionStart.current.y,
            width: worldPosition.x - pendingSelectionStart.current.x,
            height: worldPosition.y - pendingSelectionStart.current.y,
          });
        }
      }

      if (isDraggingNewPoint && newPointId) {
        const path = paths.find((candidate) => candidate.points.some((point) => point.id === newPointId));
        const point = path?.points.find((candidate) => candidate.id === newPointId);
        if (!point) return;

        const dx = worldPosition.x - point.x;
        const dy = worldPosition.y - point.y;

        moveHandle(newPointId, 'handleOut', dx, dy);
        moveHandle(newPointId, 'handleIn', -dx, -dy);
      }
    },
    [
      currentTool,
      isDraggingNewPoint,
      isPanning,
      lastPointerPos,
      moveHandle,
      newPointId,
      offset.x,
      offset.y,
      paths,
      selectionStart,
      setMousePosition,
      setOffset,
      setSelectionRect,
      setSelectionStart,
      setSnapGuides,
      toWorld,
      zoom,
    ],
  );

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      document.body.style.cursor = 'default';
    }

    pendingSelectionStart.current = null;
    setIsDraggingNewPoint(false);
    setNewPointId(null);
    setLastPointerPos(null);
    setSnapGuides({ x: null, y: null });

    const state = useCanvasState.getState();

    if (currentTool === 'select' && selectionStart && selectionRect) {
      const { x, y, width, height } = selectionRect;
      const normalizedRect = {
        x: Math.min(x, x + width),
        y: Math.min(y, y + height),
        width: Math.abs(width),
        height: Math.abs(height),
      };

      const allPoints = state.present.paths.flatMap((path) => path.points);
      const selected = allPoints
        .filter((point) =>
          point.x >= normalizedRect.x &&
          point.x <= normalizedRect.x + normalizedRect.width &&
          point.y >= normalizedRect.y &&
          point.y <= normalizedRect.y + normalizedRect.height,
        )
        .map((point) => point.id);

      if (selected.length === 1) {
        state.selectPoint(selected[0]);
      } else {
        state.setSelectedPointIds(selected);
        state.deselectPoint();
      }

      setSelectionStart(null);
      setSelectionRect(null);
    }
  }, [currentTool, isPanning, selectionRect, selectionStart, setIsPanning, setSelectionRect, setSelectionStart, setSnapGuides]);

  const handleMouseLeave = useCallback(() => {
    setMousePosition(null);
    setSnapGuides({ x: null, y: null });
  }, [setMousePosition, setSnapGuides]);

  const handleWheel = useCallback(
    (event: Konva.KonvaEventObject<WheelEvent>) => {
      // If we're currently interacting with a texture overlay while in texture tool,
      // or if the user is currently holding a mouse button down in the texture tool,
      // do not let the stage handle zooming. This prevents the "drag then quick
      // Ctrl+wheel" case where wheel happens before mouseup and the stage still zooms.
      const nativeEvent = event.evt as WheelEvent & { buttons?: number };
      const stateNow = useCanvasState.getState();
      const isMouseDown = !!(nativeEvent && nativeEvent.buttons && nativeEvent.buttons !== 0);

      // Additionally, suppress stage zoom for a short debounce window after the last
      // texture interaction to be robust against event ordering where wheel can race.
      const now = Date.now();
      const lastTexture = stateNow.textureLastInteractionAt || 0;
      const debounceMs = 400;

      if (stateNow.currentTool === 'texture' && (stateNow.textureInteractionActive || isMouseDown || (now - lastTexture) < debounceMs)) {
        return;
      }

      if (!nativeEvent.ctrlKey && !nativeEvent.metaKey) return;

      nativeEvent.preventDefault();
      const stage = event.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (!stage || !pointer) return;

      const state = useCanvasState.getState();
      const { zoom: currentZoom, offset: currentOffset } = state;
      // Use multiplicative (exponential) zooming for smoother behavior at very low/high zoom levels
      const sensitivity = 0.001; // smaller sensitivity for finer control
      const minZoom = 0.05;
      const maxZoom = 20;
      const delta = nativeEvent.deltaY;

      // Convert wheel delta into a multiplicative factor (exp-based) which scales the current zoom.
      // This avoids huge additive jumps when current zoom is very small.
      const rawFactor = Math.exp(-delta * sensitivity);
      const minFactor = 0.6; // clamp factor to avoid extreme jumps from errant large deltas
      const maxFactor = 1.5;
      const factor = Math.max(minFactor, Math.min(maxFactor, rawFactor));
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, currentZoom * factor));

      const mouse = {
        x: (pointer.x - currentOffset.x) / currentZoom,
        y: (pointer.y - currentOffset.y) / currentZoom,
      };

      const nextOffset = {
        x: pointer.x - mouse.x * nextZoom,
        y: pointer.y - mouse.y * nextZoom,
      };

      state.setZoom(nextZoom);
      state.setOffset(nextOffset);
    },
    [],
  );

  // Right-click behavior: prevent browser context menu on the canvas
  // and finish the current pen path automatically when drawing.
  const handleContextMenu = useCallback((event: Konva.KonvaEventObject<MouseEvent>) => {
    // Prevent the browser context menu
    event.evt.preventDefault();

    const state = useCanvasState.getState();
    if (state.currentTool === 'pen') {
      // Finish the path being drawn (if any)
      state.finishCurrentPath?.();
    }
  }, []);

  const isTransformVisible = selectedPointIds.length > 0 && !selectionStart;
  const showPenPreview = currentTool === 'pen' && !isDraggingNewPoint && !useCanvasState.getState().isDraggingHandle;

  return (
    <Stage
      ref={stageRef}
      scale={{ x: zoom, y: zoom }}
      x={offset.x}
      y={offset.y}
      width={width}
      height={height}
      style={{ background: '#f0f0f0', cursor: stageCursor }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    >
      <GridLayer width={width} height={height} zoom={zoom} offset={offset} />
      <Layer>
        {backgroundImages.map((image) => (
          <BackgroundImage key={image.id} {...image} />
        ))}

        <PathsLayer />
        <SeamLayer />
        <PointsLayer />
        {showPenPreview && <PenSegmentPreview />}

        {selectionRect && selectionStart && currentTool === 'select' && (
          <Rect
            x={Math.min(selectionRect.x, selectionRect.x + selectionRect.width)}
            y={Math.min(selectionRect.y, selectionRect.y + selectionRect.height)}
            width={Math.abs(selectionRect.width)}
            height={Math.abs(selectionRect.height)}
            stroke="blue"
            strokeWidth={1 / zoom}
          />
        )}

        {snapGuides.x !== null && (
          <Line points={[snapGuides.x, -10000, snapGuides.x, 10000]} stroke="deepskyblue" strokeWidth={1 / zoom} listening={false} />
        )}

        {snapGuides.y !== null && (
          <Line points={[-10000, snapGuides.y, 10000, snapGuides.y]} stroke="deepskyblue" strokeWidth={1 / zoom} listening={false} />
        )}

        <SelectionTransformer isVisible={isTransformVisible} />
      </Layer>
    </Stage>
  );
}
