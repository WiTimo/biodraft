import { Stage, Layer, Rect } from 'react-konva';
import { useCanvasState } from './CanvasState';
import { PointCircle } from './PointCircle';
import { LinePath } from './LinePath';
import { HandleCircle } from './HandleCircle';
import { useEffect, useState } from 'react';
import { BackgroundImage } from './BackgroundImage';
import { importFromJson } from './importExport';
import { SelectionBox } from './SelectionBox';

const STATIC_MAN_IMAGE_ID = 'static-man';

export function Canvas() {
  const { present, addPoint, finishCurrentPath, selectPoint, currentTool, deselectBackgroundImages, moveHandle, setTool } = useCanvasState();
  const { paths, backgroundImages } = present;
  const [isDraggingNewPoint, setIsDraggingNewPoint] = useState(false);
  const [newPointId, setNewPointId] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<null | { x: number; y: number; width: number; height: number }>(null);
  const [selectionStart, setSelectionStart] = useState<null | { x: number; y: number }>(null);

  const { undo, redo } = useCanvasState();
  const deleteSelectedPoint = useCanvasState((s) => s.deleteSelectedPoint);


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
  
        const scale = 0.8; // 👈 adjust this to make it smaller or bigger
  
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
        state.toggleLockBackgroundImage(STATIC_MAN_IMAGE_ID); // lock it
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

          if (currentTool === 'select') {
            if (clickedOnEmptyCanvasOrBackground) {
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

          {currentTool === 'select' && <SelectionBox />}
        </Layer>
      </Stage>
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
      <button onClick={() => setTool('pen')}>Pen Tool</button>
      <button onClick={() => setTool('background')}>Background Tool</button>
      <button onClick={() => setTool('select')}>Select Tool</button>
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
