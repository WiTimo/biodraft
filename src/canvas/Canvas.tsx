import { Stage, Layer } from 'react-konva';
import { useCanvasState } from './canvasState';
import { PointCircle } from './PointCircle';
import { LinePath } from './LinePath';
import { HandleCircle } from './HandleCircle';
import { useEffect, useState } from 'react';
import { BackgroundImage } from './BackgroundImage';
import { importFromJson } from './importExport';

export function Canvas() {
  const { present, addPoint, finishCurrentPath, selectPoint, currentTool, deselectBackgroundImages, moveHandle, setTool } = useCanvasState();
  const { paths, backgroundImages } = present;
  const [isDraggingNewPoint, setIsDraggingNewPoint] = useState(false);
  const [newPointId, setNewPointId] = useState<string | null>(null);

  const { undo, redo } = useCanvasState();
  const deleteSelectedPoint = useCanvasState((s) => s.deleteSelectedPoint);

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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteSelectedPoint]);




  return (
    <div className="w-full h-full">
      <Stage
        width={window.innerWidth}
        height={window.innerHeight}
        style={{ background: '#f0f0f0' }}
        onMouseDown={(e) => {
          const stage = e.target.getStage();
          if (!stage) return;

          const pointerPosition = stage.getPointerPosition();
          if (!pointerPosition) return;

          const targetName = e.target.name(); // undefined if click on Stage
          const clickedOnEmptyCanvasOrBackground =
            !targetName ||
            targetName === 'background' ||
            targetName === 'canvas' ||
            targetName === 'background-image';

          if (currentTool === 'background') {
            if (clickedOnEmptyCanvasOrBackground) {
              deselectBackgroundImages();
              useCanvasState.getState().deselectPoint();
            }
            return;
          }

          if (currentTool === 'pen') {
            if (e.evt.detail === 2) {
              finishCurrentPath();
              return;
            }

            if (!clickedOnEmptyCanvasOrBackground) {
              // Clicked on point or handle ➔ don't place point
              return;
            }

            const id = addPoint(pointerPosition.x, pointerPosition.y, true);
            setNewPointId(id);
            setIsDraggingNewPoint(true);
            selectPoint(id);
          }
        }}

        onMouseMove={(e) => {
          if (!isDraggingNewPoint || !newPointId) return;

          const stage = e.target.getStage();
          if (!stage) return;
          const pointerPosition = stage.getPointerPosition();
          if (!pointerPosition) return;

          const path = paths.find((p) => p.points.find(pt => pt.id === newPointId));
          const point = path?.points.find(pt => pt.id === newPointId);
          if (!point) return;

          const dx = pointerPosition.x - point.x;
          const dy = pointerPosition.y - point.y;

          moveHandle(newPointId, 'handleOut', dx, dy);
          moveHandle(newPointId, 'handleIn', -dx, -dy);
        }}
        onMouseUp={() => {
          setIsDraggingNewPoint(false);
          setNewPointId(null);
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

          {paths.map((path) => (
            <LinePath
              key={path.id}
              points={path.points}
              closed={path.closed}
            />
          ))}
          {paths.map((path) =>
            path.points.map((p) => (
              <>
                <HandleCircle
                  key={p.id + '-in'}
                  pointX={p.x}
                  pointY={p.y}
                  dx={p.handleIn.dx}
                  dy={p.handleIn.dy}
                  pointId={p.id}
                  type="handleIn"
                />
                <HandleCircle
                  key={p.id + '-out'}
                  pointX={p.x}
                  pointY={p.y}
                  dx={p.handleOut.dx}
                  dy={p.handleOut.dy}
                  pointId={p.id}
                  type="handleOut"
                />
                <PointCircle key={p.id} id={p.id} x={p.x} y={p.y} />
              </>
            ))
          )}

        </Layer>
      </Stage>
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
        <button onClick={() => setTool('pen')}>Pen Tool</button>
        <button onClick={() => setTool('background')}>Background Tool</button>
      </div>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              if (reader.result) {
                const id = crypto.randomUUID();
                useCanvasState.getState().addBackgroundImage(reader.result as string, id);
                useCanvasState.getState().setTool('background');
                useCanvasState.getState().selectBackgroundImage(id);
              }
            };
            reader.readAsDataURL(file);
          }
        }}
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 1000,
        }}
      />
      <button onClick={() => {
        const { paths } = useCanvasState.getState().present;
        const exportData = paths.map((path) => ({
          id: path.id,
          points: path.points.map((p) => ({
            x: p.x,
            y: p.y,
            handleIn: {
              dx: p.handleIn.dx,
              dy: p.handleIn.dy,
            },
            handleOut: {
              dx: p.handleOut.dx,
              dy: p.handleOut.dy,
            }
          })),
          closed: path.closed
        }));

        const blob = new Blob(
          [JSON.stringify({ patterns: exportData }, null, 2)],
          { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'patterns_with_handles.json';
        a.click();
        URL.revokeObjectURL(url);
      }}>Export JSON</button>
      <input
        type="file"
        accept="application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            importFromJson(file);
          }
        }}
      />
    </div>

  );
}
