import { Stage, Layer, Rect, Line, Text } from 'react-konva';
import { useCanvasState } from './state/CanvasState';
import { useEffect, useRef, useState } from 'react';
import { BackgroundImage } from './BackgroundImage/BackgroundImage';
import { ImageTransformPanel } from './UI/ImageTransformPanel';
import { PathsLayer } from './Layers/PathsLayer';
import { PointsLayer } from './Layers/PointsLayer';
import { Toolbar } from './UI/Toolbar';
import Konva from 'konva';
import { SelectionTransformer } from './Layers/SelectionTransformer';
import { PenSegmentPreview } from './Previews/PenSegmentPreview';
import { SeamLayer } from './Layers/SeamLayer';
import { ThreeDView } from './UI/ThreeDView';

Konva.showWarnings = false;

const STATIC_MAN_IMAGE_ID = 'static-man';
const STATIC_MAN_BACK_IMAGE_ID = "static-man-back"

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
    selectedPointIds,
    snapGuides,
    threeDEnabled,
    toggle3D,
    splitWidth: split,
    setSplitWidth: setSplit,
    setIsSimulationMode
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
  const pendingSelectionStart = useRef<any>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const state = useCanvasState.getState();

    const manFrontExists = state.present.backgroundImages.some(
      img => img.id === STATIC_MAN_IMAGE_ID
    );
    const manBackExists = state.present.backgroundImages.some(
      img => img.id === STATIC_MAN_BACK_IMAGE_ID
    );

    if (!manFrontExists || !manBackExists) {
      const frontImg = new Image();
      frontImg.src = '/images/man_front.png';

      const backImg = new Image();
      backImg.src = '/images/man_back.png';

      frontImg.onload = () => {
        backImg.onload = () => {
          const canvasWidth = window.innerWidth;
          const canvasHeight = window.innerHeight;

          const scale = 0.8;

          const frontWidth = frontImg.width * scale;
          const frontHeight = frontImg.height * scale;

          const backWidth = backImg.width * scale;
          const backHeight = backImg.height * scale;

          const totalWidth = frontWidth + backWidth + 40;

          const startX = (canvasWidth - totalWidth) / 2;
          const centerY = (canvasHeight - Math.max(frontHeight, backHeight)) / 2;

          // Front image
          state.addBackgroundImage('/images/man_front.png', STATIC_MAN_IMAGE_ID);
          state.moveBackgroundImage(STATIC_MAN_IMAGE_ID, startX, centerY);
          state.updateBackgroundImageTransform(STATIC_MAN_IMAGE_ID, {
            scaleX: scale,
            scaleY: scale,
            rotation: 0,
          });
          state.toggleLockBackgroundImage(STATIC_MAN_IMAGE_ID);

          // Back image
          const backX = startX + frontWidth + 40;
          state.addBackgroundImage('/images/man_back.png', STATIC_MAN_BACK_IMAGE_ID);
          state.moveBackgroundImage(STATIC_MAN_BACK_IMAGE_ID, backX, centerY);
          state.updateBackgroundImageTransform(STATIC_MAN_BACK_IMAGE_ID, {
            scaleX: scale,
            scaleY: scale,
            rotation: 0,
          });
          state.toggleLockBackgroundImage(STATIC_MAN_BACK_IMAGE_ID);
        };
      };
    }
  }, []);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === "ControlLeft") setIsSpacePressed(true);
      if (e.key === 'Shift') {
        useCanvasState.getState().setIsShiftPressed(true);
      }
      if (e.key === 'Alt') useCanvasState.getState().setIsAltPressed(true);
      const toolKeys = {
        KeyW: 'select',
        KeyE: 'pen',
        KeyG: 'background',
        KeyS: 'seam',
      } as const;

      const selectedTool = toolKeys[e.code as keyof typeof toolKeys];
      if (selectedTool) {
        e.preventDefault();
        useCanvasState.getState().setTool(selectedTool);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        useCanvasState.getState().setTool("select");
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        // 1️⃣ if a seam segment is selected, remove that seam
// Canvas.tsx (inside your keydown handler)
if (currentTool === 'seam') {
  const sel = useCanvasState.getState().selectedSeamSegment;
  if (sel) {
    // 1. Grab the array of all seam‐pairs
    const seams = useCanvasState.getState().present.seams as [Segment, Segment][];

    // 2. Find the one pair where either side matches sel
    const seamPair = seams.find(
      ([segA, segB]) =>
        (segA[0] === sel[0] && segA[1] === sel[1]) ||
        (segB[0] === sel[0] && segB[1] === sel[1])
    );

    // 3. If found, remove it
    if (seamPair) {
      useCanvasState.getState().removeSeam(seamPair[0], seamPair[1]);
      // clear selection so UI resets
      useCanvasState.getState().setSelectedSeamSegment(null);
    }
    // prevent any further Delete logic
    e.preventDefault();
    return;
  }
}

        if (selectedPointIds.length > 0) {
          useCanvasState.getState().deleteSelectedPoints();
        } else {
          deleteSelectedPoint();
        }
        if (selectedBackgroundId) deleteSelectedBackgroundImage();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        useCanvasState.getState().copySelectedPoints();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        useCanvasState.getState().pasteClipboardPoints();
      }

    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space'|| e.code === "ControlLeft") {
        setIsSpacePressed(false);
        if (isPanning) {
          setIsPanning(false);
          document.body.style.cursor = 'default';
        }
      }
      if (e.key === 'Shift') {
        useCanvasState.getState().setIsShiftPressed(false);
      }
      if (e.key === 'Alt') useCanvasState.getState().setIsAltPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [undo, redo, deleteSelectedPoint, selectedBackgroundId, isPanning, selectedPointIds]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const min = 100;
      const max = window.innerWidth - 100;
      setSplit(Math.min(max, Math.max(min, e.clientX)));
      setIsSimulationMode(false)
    };
    const onMouseUp = () => {
      setIsResizing(false)
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="w-full h-full flex">
      {/* ── Left half: 3D view (when toggled) ─────────────────── */}
      {threeDEnabled && (
        isResizing ? 
        <div className="h-full grid place-items-center overflow-hidden rounded-r-2xl bg-black" style={{ width: split }}>
          <img src='/svg/loader.svg' className='h-14 w-14 select-none'/>
        </div>
        :
        <div className="h-full overflow-hidden rounded-r-2xl" style={{ width: split }}>
          <ThreeDView />
        </div>
      )}
      {/* ── Draggable sash ─────────────────────────────────────── */}
      {threeDEnabled && (
        <div
          onMouseDown={() => setIsResizing(true)}
          className="h-full relative z-10"
          style={{ width: 10, cursor: 'col-resize' }}
        />
      )}
      <div
        className="h-full relative overflow-hidden"
        style={{
          flex: 1,
          width: threeDEnabled ? window.innerWidth - split : '100%',
          borderTopLeftRadius: threeDEnabled ? "1rem" : 0,
          borderBottomLeftRadius: threeDEnabled ? "1rem" : 0,
        }}
      >
        <ImageTransformPanel />
        <Stage
          scale={{ x: zoom, y: zoom }}
          x={offset.x}
          y={offset.y}
          ref={stageRef}
          width={window.innerWidth}
          height={window.innerHeight}
          style={{
            background: '#f0f0f0',
            cursor:
              isPanning
                ? 'grabbing'
                : isSpacePressed
                  ? 'grab'
                  : currentTool === 'pen'
                    ? 'url(/cursors/pen.svg) 0 0, auto'
                    : currentTool === "select"
                      ? 'url(/cursors/select.svg) 8 4, auto'
                      : 'default',
          }}

          onMouseDown={(e) => {
            const stage = e.target.getStage();
            if (!stage) return;

            const pointer = stage.getPointerPosition();
            if (!pointer) return;

            const isMiddleMouse = e.evt.button === 1;
            const isSpacePressedNow = isSpacePressed;

            if (isMiddleMouse || isSpacePressedNow) {
              setIsPanning(true);
              setLastPointerPos(pointer);
              document.body.style.cursor = 'grabbing';
              return;
            }

            const target = e.target;
            const targetName = target.name();
            const world = {
              x: (pointer.x - offset.x) / zoom,
              y: (pointer.y - offset.y) / zoom,
            };

            if (targetName?.includes('transform-handle')) return;

            const isStageClick = target === stage;
            const isBackgroundClick = targetName === 'background-image';

            if (currentTool === 'background') {
              if (isStageClick || isBackgroundClick) {
                deselectBackgroundImages();
                useCanvasState.getState().deselectPoint();
              }
              return;
            }

            if (currentTool === 'seam') {
              const isClickingOutsideSegment = !targetName?.includes('seam-segment');

              if (isClickingOutsideSegment) {
                useCanvasState.getState().setSeamSelection([]);
                useCanvasState.getState().setSelectedSeamSegment(null);
              }
              return;
            }


            if (currentTool === 'select') {
              const isClickingOnEmpty = isStageClick || targetName === '';
              const clickedInsideBox =
                selectionRect &&
                pointer.x >= selectionRect.x &&
                pointer.x <= selectionRect.x + selectionRect.width &&
                pointer.y >= selectionRect.y &&
                pointer.y <= selectionRect.y + selectionRect.height;

              if (isClickingOnEmpty && !clickedInsideBox) {
                pendingSelectionStart.current = world;
                setSelectionRect(null);
                useCanvasState.getState().clearSelectedPointIds();
                useCanvasState.getState().deselectPoint();
              }
              return;
            }

            if (currentTool === 'pen') {
              if (e.evt.detail === 2) {
                finishCurrentPath();
                return;
              }

              if (!isStageClick && targetName !== 'background-image' && targetName !== 'background') return;

              const guides = useCanvasState.getState().snapGuides;
              const finalX = guides.x ?? world.x;
              const finalY = guides.y ?? world.y;

              const id = addPoint(finalX, finalY, true);
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

            if (currentTool === 'pen') {
              const world = {
                x: (pointer.x - offset.x) / zoom,
                y: (pointer.y - offset.y) / zoom,
              };

              const SNAP_RADIUS = 10 / zoom;
              const allPoints = paths.flatMap(p => p.points);

              let snapX: number | null = null;
              let snapY: number | null = null;

              for (const pt of allPoints) {
                if (Math.abs(world.x - pt.x) < SNAP_RADIUS) snapX = pt.x;
                if (Math.abs(world.y - pt.y) < SNAP_RADIUS) snapY = pt.y;
              }

              useCanvasState.getState().setSnapGuides({ x: snapX, y: snapY });
            }

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
            useCanvasState.getState().setMousePosition(world);

            if (currentTool === 'select' && pendingSelectionStart.current) {
              const distX = world.x - pendingSelectionStart.current.x;
              const distY = world.y - pendingSelectionStart.current.y;
              const distance = Math.sqrt(distX * distX + distY * distY);

              if (!selectionStart && distance > 4) {
                // ✅ start actual box drawing only after dragging
                setSelectionStart(pendingSelectionStart.current);
              }

              if (selectionStart || distance > 4) {
                setSelectionRect({
                  x: pendingSelectionStart.current.x,
                  y: pendingSelectionStart.current.y,
                  width: world.x - pendingSelectionStart.current.x,
                  height: world.y - pendingSelectionStart.current.y,
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
            if (isPanning) {
              setIsPanning(false);
              document.body.style.cursor = 'default';
              return;
            }

            pendingSelectionStart.current = null;
            setIsDraggingNewPoint(false);
            setNewPointId(null);
            setLastPointerPos(null);
            setIsPanning(false);
            document.body.style.cursor = 'default';
            useCanvasState.getState().setSnapGuides({ x: null, y: null });

            if (currentTool === 'select' && selectionStart && selectionRect) {
              const { x, y, width, height } = selectionRect;
              const rect = {
                x: Math.min(x, x + width),
                y: Math.min(y, y + height),
                width: Math.abs(width),
                height: Math.abs(height),
              };

              const allPaths = useCanvasState.getState().present.paths;
              const allPoints = allPaths.flatMap(p => p.points);

              const individuallySelectedPoints = allPoints
                .filter(p =>
                  p.x >= rect.x &&
                  p.x <= rect.x + rect.width &&
                  p.y >= rect.y &&
                  p.y <= rect.y + rect.height
                )
                .map(p => p.id);

              if (individuallySelectedPoints.length === 1) {
                useCanvasState.getState().selectPoint(individuallySelectedPoints[0]);
              } else {
                useCanvasState.getState().setSelectedPointIds(individuallySelectedPoints);
                useCanvasState.getState().deselectPoint();
              }

              setSelectionStart(null);
              setSelectionRect(null);
            }

          }}


          onMouseLeave={() => {
            useCanvasState.getState().setMousePosition(null);
            useCanvasState.getState().setSnapGuides({ x: null, y: null });
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
            <SeamLayer />
            <PointsLayer />
            {currentTool === 'pen' && !isDraggingNewPoint && !useCanvasState.getState().isDraggingHandle && <PenSegmentPreview />}
            {/* 👇 Show selection box only during drag (visual aid) */}
            {selectionRect && selectionStart && currentTool === 'select' && (
              <Rect
                x={Math.min(selectionRect.x, selectionRect.x + selectionRect.width)}
                y={Math.min(selectionRect.y, selectionRect.y + selectionRect.height)}
                width={Math.abs(selectionRect.width)}
                height={Math.abs(selectionRect.height)}
                stroke="blue"
                strokeWidth={1}
                dash={[4, 4]}
              />
            )}


            {snapGuides.x !== null && (
              <Line
                points={[snapGuides.x, -10000, snapGuides.x, 10000]}
                stroke="deepskyblue"
                strokeWidth={1}
                dash={[4, 4]}
                listening={false}
              />
            )}
            {snapGuides.y !== null && (
              <Line
                points={[-10000, snapGuides.y, 10000, snapGuides.y]}
                stroke="deepskyblue"
                strokeWidth={1}
                dash={[4, 4]}
                listening={false}
              />
            )}

            <SelectionTransformer isVisible={selectedPointIds.length > 0 && !selectionStart} />
          
            <Line points={[700, -1500, 700, 2000]} stroke={"gray"} strokeWidth={2} />
            <Text offsetX={175} offsetY={400} fontSize={78} fontVariant='bold' fill={"gray"} text='Front' />
            <Text offsetX={-1400} offsetY={400} fontSize={78} fontVariant='bold' fill={"gray"} text='Back' />
          
          </Layer>
        </Stage>
        {/* Toggle button (top-left) */}
        <button
          onClick={toggle3D}
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 5000,
            padding: '6px 12px',
            borderWidth: 3,
            borderStyle: 'solid',
            borderColor: threeDEnabled ? '#4781e6' : '#ddd',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          <img src='/svg/toggle3d.svg' className='h-10 w-10' />
        </button>
        <Toolbar />
      </div>
    </div>
  );
}
