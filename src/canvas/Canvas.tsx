import { Stage, Layer, Rect } from 'react-konva';
import { useCanvasState } from './state/CanvasState';
import { useEffect, useState } from 'react';
import { BackgroundImage } from './BackgroundImage/BackgroundImage';
import { ImageTransformPanel } from './UI/ImageTransformPanel';
import { PathsLayer } from './Layers/PathsLayer';
import { PointsLayer } from './Layers/PointsLayer';
import { Toolbar } from './UI/Toolbar';
import Konva from 'konva';

Konva.showWarnings = false;

const STATIC_MAN_IMAGE_ID = 'static-man';

export function Canvas() {
  const {
    present,
    addPoint,
    undo,
    redo,
    finishCurrentPath,
    currentTool,
    deselectBackgroundImages,
    moveHandle,
    deleteSelectedBackgroundImage,
    deleteSelectedPoint,
    selectedBackgroundId,
    zoom,
    offset,
    setOffset,
  } = useCanvasState();
  const { paths, backgroundImages } = present;

  const [isDraggingNewPoint, setIsDraggingNewPoint] = useState(false);
  const [newPointId, setNewPointId] = useState<string | null>(null);
  const selectionRect = useCanvasState(s => s.selectionRect);
  const selectionStart = useCanvasState(s => s.selectionStart);
  const setSelectionRect = useCanvasState(s => s.setSelectionRect);
  const setSelectionStart = useCanvasState(s => s.setSelectionStart);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [dragStartBox, setDragStartBox] = useState<{ x: number; y: number } | null>(null);
  const [pendingSelectionStart, setPendingSelectionStart] = useState<null | { x: number; y: number }>(null);

  useEffect(() => {
    const manImageAlreadyPresent = useCanvasState.getState().present.backgroundImages.some(
      img => img.id === STATIC_MAN_IMAGE_ID
    );
    if (!manImageAlreadyPresent) {
      const img = new Image();
      img.src = '/images/man_front.png';
      img.onload = () => {
        const canvasWidth = window.innerWidth;
        const canvasHeight = window.innerHeight;
        const imgWidth = img.width;
        const imgHeight = img.height;
        const scale = 0.8;

        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;

        const x = (canvasWidth - scaledWidth) / 2;
        const y = (canvasHeight - scaledHeight) / 2;

        const state = useCanvasState.getState();
        state.addBackgroundImage('/images/man_front.png', STATIC_MAN_IMAGE_ID);
        state.moveBackgroundImage(STATIC_MAN_IMAGE_ID, x, y);
        state.updateBackgroundImageTransform(STATIC_MAN_IMAGE_ID, {
          scaleX: scale,
          scaleY: scale,
          rotation: 0
        });
        state.toggleLockBackgroundImage(STATIC_MAN_IMAGE_ID);
      };
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(true);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedPoint();
        if (selectedBackgroundId) deleteSelectedBackgroundImage();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        if (isPanning) {
          setIsPanning(false);
          document.body.style.cursor = 'default';
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [undo, redo, deleteSelectedPoint, selectedBackgroundId, isPanning]);

  return (
    <div className="w-full h-full">
      <ImageTransformPanel />
      <Stage
        scale={{ x: zoom, y: zoom }}
        x={offset.x}
        y={offset.y}
        width={window.innerWidth}
        height={window.innerHeight}
        style={{
          background: '#f0f0f0',
          cursor: isPanning ? 'grabbing' : isSpacePressed ? 'grab' : 'default',
        }}
        onMouseDown={(e) => {
          const stage = e.target.getStage();
          if (!stage) return;

          const pointer = stage.getPointerPosition();
          if (!pointer) return;

          if (isSpacePressed) {
            setIsPanning(true);
            setLastPointerPos(pointer);
            document.body.style.cursor = 'grabbing';
            return;
          }

          const world = {
            x: (pointer.x - offset.x) / zoom,
            y: (pointer.y - offset.y) / zoom,
          };

          const target = e.target;
          const targetName = target.name();
          const isStageClick = target === stage;
          const isBackgroundClick = targetName === 'background-image';

          if (currentTool === 'background') {
            if (isStageClick || isBackgroundClick) {
              deselectBackgroundImages();
              useCanvasState.getState().deselectPoint();
            }
            return;
          }

          if (currentTool === 'select') {
            const isClickingOnEmpty = e.target === stage || e.target.name() === '';
            const clickedInsideBox =
              selectionRect &&
              world.x >= selectionRect.x &&
              world.x <= selectionRect.x + selectionRect.width &&
              world.y >= selectionRect.y &&
              world.y <= selectionRect.y + selectionRect.height;
          
            if (isClickingOnEmpty && !clickedInsideBox) {
              setPendingSelectionStart(world); // ✅ only store it
              setSelectionRect(null);
              useCanvasState.getState().clearSelectedPointIds();
              useCanvasState.getState().deselectPoint();
            }
          }
          
          

          if (currentTool === 'pen') {
            if (e.evt.detail === 2) {
              finishCurrentPath();
              return;
            }

            if (!isStageClick && targetName !== 'background-image' && targetName !== 'background') return;

            const id = addPoint(world.x, world.y, true);
            useCanvasState.getState().selectPoint(id);
            setNewPointId(id);
            setIsDraggingNewPoint(true);
          }
        }}
        onMouseMove={(e) => {
          const stage = e.target.getStage();
          if (!stage) return;

          const pointer = stage.getPointerPosition();
          if (!pointer) return;

          if (isPanning && lastPointerPos) {
            const dx = pointer.x - lastPointerPos.x;
            const dy = pointer.y - lastPointerPos.y;
            setOffset({ x: offset.x + dx, y: offset.y + dy });
            setLastPointerPos(pointer);
            return;
          }

          const world = {
            x: (pointer.x - offset.x) / zoom,
            y: (pointer.y - offset.y) / zoom,
          };

          if (currentTool === 'select' && pendingSelectionStart) {
            const distX = world.x - pendingSelectionStart.x;
            const distY = world.y - pendingSelectionStart.y;
            const distance = Math.sqrt(distX * distX + distY * distY);
          
            if (!selectionStart && distance > 4) {
              // ✅ start actual box drawing only after dragging
              setSelectionStart(pendingSelectionStart);
            }
          
            if (selectionStart || distance > 4) {
              setSelectionRect({
                x: pendingSelectionStart.x,
                y: pendingSelectionStart.y,
                width: world.x - pendingSelectionStart.x,
                height: world.y - pendingSelectionStart.y,
              });
            }
          }
          

          if (isDraggingNewPoint && newPointId) {
            const path = paths.find(p => p.points.some(pt => pt.id === newPointId));
            const point = path?.points.find(pt => pt.id === newPointId);
            if (!point) return;

            const dx = world.x - point.x;
            const dy = world.y - point.y;

            moveHandle(newPointId, 'handleOut', dx, dy);
            moveHandle(newPointId, 'handleIn', -dx, -dy);
          }
        }}
        onMouseUp={() => {
          setPendingSelectionStart(null);
          setIsDraggingNewPoint(false);
          setNewPointId(null);
          setLastPointerPos(null);
          setIsPanning(false);
          document.body.style.cursor = 'default';
        
          if (currentTool === 'select' && selectionStart && selectionRect) {
            const { x, y, width, height } = selectionRect;
            const rect = {
              x: Math.min(x, x + width),
              y: Math.min(y, y + height),
              width: Math.abs(width),
              height: Math.abs(height),
            };
        
            const allPoints = useCanvasState.getState().present.paths.flatMap((p) => p.points);
            const ids = allPoints
              .filter(
                (p) =>
                  p.x >= rect.x &&
                  p.x <= rect.x + rect.width &&
                  p.y >= rect.y &&
                  p.y <= rect.y + rect.height
              )
              .map((p) => p.id);
        
            useCanvasState.getState().setSelectedPointIds(ids);
            setSelectionStart(null);
          }
        }}
        onWheel={(e) => {
          const evt = e.evt;
          if (!evt.ctrlKey && !evt.metaKey) return;

          evt.preventDefault();
          const stage = e.target.getStage();
          const pointer = stage?.getPointerPosition();
          if (!stage || !pointer) return;

          const state = useCanvasState.getState();
          const zoom = state.zoom;
          const offset = state.offset;

          const sensitivity = 0.0025;
          const minZoom = 0.1;
          const maxZoom = 5;
          const delta = evt.deltaY;
          const newZoom = Math.min(maxZoom, Math.max(minZoom, zoom - delta * sensitivity));

          const mouse = {
            x: (pointer.x - offset.x) / zoom,
            y: (pointer.y - offset.y) / zoom,
          };

          const newOffset = {
            x: pointer.x - mouse.x * newZoom,
            y: pointer.y - mouse.y * newZoom,
          };

          state.setZoom(newZoom);
          state.setOffset(newOffset);
        }}
      >
        <Layer>
          {backgroundImages.map((img) => (
            <BackgroundImage
              key={img.id}
              id={img.id}
              src={img.src}
              x={img.x}
              y={img.y}
              scaleX={img.scaleX}
              scaleY={img.scaleY}
              rotation={img.rotation}
              opacity={img.opacity}
              locked={img.locked}
            />
          ))}

          <PathsLayer />
          <PointsLayer />

          {selectionRect && currentTool === 'select' && (
            <Rect
              x={Math.min(selectionRect.x, selectionRect.x + selectionRect.width)}
              y={Math.min(selectionRect.y, selectionRect.y + selectionRect.height)}
              width={Math.abs(selectionRect.width)}
              height={Math.abs(selectionRect.height)}
              stroke="blue"
              strokeWidth={1}
              dash={[4, 4]}
              draggable
              onMouseDown={(e) => {
                e.cancelBubble = true;
              }}
              onDragStart={(e) => {
                e.cancelBubble = true;
                useCanvasState.getState().saveState();
                setDragStartBox({ x: e.target.x(), y: e.target.y() });
              }}
              onDragMove={(e) => {
                if (!dragStartBox || !selectionRect) return;

                const dx = e.target.x() - dragStartBox.x;
                const dy = e.target.y() - dragStartBox.y;

                const selectedIds = useCanvasState.getState().selectedPointIds;
                const allPoints = useCanvasState.getState().present.paths.flatMap((p) => p.points);

                selectedIds.forEach((id) => {
                  const point = allPoints.find((p) => p.id === id);
                  if (!point) return;
                  useCanvasState.getState().movePoint(id, point.x + dx, point.y + dy);
                });

                setSelectionRect({
                  ...selectionRect,
                  x: selectionRect.x + dx,
                  y: selectionRect.y + dy,
                });

                setDragStartBox({ x: e.target.x(), y: e.target.y() });
              }}
              onDragEnd={() => {
                setDragStartBox(null);
              }}
          />

          )}

        </Layer>
      </Stage>
      <Toolbar />
    </div>
  );
}
