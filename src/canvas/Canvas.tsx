import { Stage, Layer, Rect } from 'react-konva';
import { useCanvasState } from './state/CanvasState';
import { useEffect, useState } from 'react';
import { BackgroundImage } from './BackgroundImage/BackgroundImage';
import { PathsLayer } from './Layers/PathsLayer';
import { PointsLayer } from './Layers/PointsLayer';
import Konva from 'konva';
import { CANVAS_SIZE } from '../util/globals';
Konva.showWarnings = false;

const STATIC_MAN_IMAGE_ID = 'static-man';

export function Canvas() {
  const { present, addPoint, undo, redo, finishCurrentPath, currentTool, deselectBackgroundImages, moveHandle, deleteSelectedBackgroundImage, deleteSelectedPoint, selectedBackgroundId } = useCanvasState();
  const { paths, backgroundImages } = present;
  const [isDraggingNewPoint, setIsDraggingNewPoint] = useState(false);
  const [newPointId, setNewPointId] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<null | { x: number; y: number; width: number; height: number }>(null);
  const [selectionStart, setSelectionStart] = useState<null | { x: number; y: number }>(null);

  useEffect(() => {
    const manImageAlreadyPresent = useCanvasState.getState().present.backgroundImages.some(
      img => img.id === STATIC_MAN_IMAGE_ID
    );
    if (!manImageAlreadyPresent) {
      const img = new Image();
      img.src = '/images/man_front.png';
      img.onload = () => {
        const scale = 0.8;

        const state = useCanvasState.getState();
        state.addBackgroundImage('/images/man_front.png', STATIC_MAN_IMAGE_ID);
        state.moveBackgroundImage(STATIC_MAN_IMAGE_ID, CANVAS_SIZE / 2, CANVAS_SIZE / 2);
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedPoint();
        if (selectedBackgroundId) deleteSelectedBackgroundImage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteSelectedPoint, selectedBackgroundId]);



  return (
    <Stage
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      style={{ background: '#f0f0f0' }}
      onMouseDown={(e) => {
        const stage = e.target.getStage();
        if (!stage) return;

        const pointerPosition = stage.getPointerPosition();
        if (!pointerPosition) return;

        const target = e.target;
        const targetName = target.name();
        const isStageClick = target === stage;
        const isBackgroundClick = targetName === 'background-image';

        if (currentTool === 'background') {
          // If clicked on stage OR on the background image itself, deselect
          if (isStageClick || isBackgroundClick) {
            deselectBackgroundImages();
            useCanvasState.getState().deselectPoint();
          }
          return;
        }

        if (currentTool === 'select') {
          if (isStageClick) {
            setSelectionStart(pointerPosition);
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

          if (!isStageClick && targetName !== 'background-image' && targetName !== 'background') {
            // Clicked on point or handle ➔ don't place point
            return;
          }

          const id = addPoint(pointerPosition.x, pointerPosition.y, true);
          useCanvasState.getState().selectPoint(id);
          setNewPointId(id);
          setIsDraggingNewPoint(true);
        }
      }}


      onMouseMove={(e) => {
        const stage = e.target.getStage();
        if (!stage) return;

        const pointerPosition = stage.getPointerPosition();
        if (!pointerPosition) return;

        if (currentTool === 'select' && selectionStart) {
          const width = pointerPosition.x - selectionStart.x;
          const height = pointerPosition.y - selectionStart.y;
          setSelectionRect({
            x: selectionStart.x,
            y: selectionStart.y,
            width,
            height
          });
          return;
        }

        if (isDraggingNewPoint && newPointId) {
          const path = paths.find((p) => p.points.find(pt => pt.id === newPointId));
          const point = path?.points.find(pt => pt.id === newPointId);
          if (!point) return;

          const dx = pointerPosition.x - point.x;
          const dy = pointerPosition.y - point.y;

          moveHandle(newPointId, 'handleOut', dx, dy);
          moveHandle(newPointId, 'handleIn', -dx, -dy);
        }
      }}

      onMouseUp={() => {
        setIsDraggingNewPoint(false);
        setNewPointId(null);

        if (currentTool === 'select' && selectionStart && selectionRect) {
          const rect = {
            x: Math.min(selectionStart.x, selectionStart.x + selectionRect.width),
            y: Math.min(selectionStart.y, selectionStart.y + selectionRect.height),
            width: Math.abs(selectionRect.width),
            height: Math.abs(selectionRect.height),
          };

          const allPoints = useCanvasState.getState().present.paths.flatMap(p => p.points);
          const ids = allPoints.filter(p =>
            p.x >= rect.x &&
            p.x <= rect.x + rect.width &&
            p.y >= rect.y &&
            p.y <= rect.y + rect.height
          ).map(p => p.id);

          useCanvasState.getState().setSelectedPointIds(ids);
          setSelectionStart(null);
          setSelectionRect(null);
        }

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
            listening={false}
          />
        )}
      </Layer>
    </Stage>
  );
}
