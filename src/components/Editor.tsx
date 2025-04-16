import { useRef, useState, useEffect } from "react";
import { Stage, Layer, Rect } from "react-konva";
import { v4 as uuidv4 } from "uuid";
import useImage from "use-image";
import { Image as KonvaImage } from "react-konva";
import PathRenderer from "../components/PathRenderer";
import { usePointEditor } from "../hooks/usePointEditor";
import { BezierPoint, Mode, Path } from "../types/types";
import {
  SNAPPING_THRESHOLD,
} from "../constants/ui";

export default function Editor() {
  const stageRef = useRef<any>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [backgroundImage, status] = useImage("/test.png");
  const [imageScale, setImageScale] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });

  const [paths, setPaths] = useState<Path[]>([]);
  const [currentPoints, setCurrentPoints] = useState<BezierPoint[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [mouseDownPoint, setMouseDownPoint] = useState<{ x: number; y: number } | null>(null);
  const [previewPoint, setPreviewPoint] = useState<BezierPoint | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<Mode>("DRAW");

  const {
    selectedPointId,
    setSelectedPointId,
    draggingAnchorId,
    setDraggingAnchorId,
    draggingHandle,
    setDraggingHandle,
    onAnchorDragMove,
    onHandleDragMove,
  } = usePointEditor(setCurrentPoints);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.05;
    const oldScale = stageScale;
    const pointer = stageRef.current.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - stagePosition.x) / oldScale,
      y: (pointer.y - stagePosition.y) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? 1 : -1;
    const newScale = direction > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    setStageScale(newScale);
    setStagePosition(newPos);
  };

  const handleDoubleClick = () => {
    if (currentPoints.length > 1) {
      setPaths((prev) => [...prev, { id: uuidv4(), points: currentPoints, closed: true }]);
    }
    setCurrentPoints([]);
    setDrawing(false);
  };

  useEffect(() => {
    if (status === "loaded" && backgroundImage) {
      const imageAspect = backgroundImage.width / backgroundImage.height;
      const canvasAspect = window.innerWidth / window.innerHeight;
      const scale = canvasAspect > imageAspect
        ? window.innerHeight / backgroundImage.height
        : window.innerWidth / backgroundImage.width;
      const imgWidth = backgroundImage.width * scale;
      const imgHeight = backgroundImage.height * scale;
      setImageScale(scale);
      setImageOffset({
        x: (window.innerWidth - imgWidth) / 2,
        y: (window.innerHeight - imgHeight) / 2,
      });
    }
  }, [status, backgroundImage]);

  return (
    <>
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 1000 }}>
        <button
          onClick={() => setMode("DRAW")}
          style={{ marginRight: 8, backgroundColor: mode === "DRAW" ? "#666" : "#ccc" }}
        >
          Draw
        </button>
        <button
          onClick={() => setMode("SELECT")}
          style={{ backgroundColor: mode === "SELECT" ? "#666" : "#ccc" }}
        >
          Select
        </button>
      </div>
      <Stage
        width={window.innerWidth}
        height={window.innerHeight}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePosition.x}
        y={stagePosition.y}
        ref={stageRef}
        onWheel={handleWheel}
        onMouseDown={(e) => {
          if (e.evt.button === 2) return;
          if (e.evt.ctrlKey || e.evt.metaKey) {
            setIsPanning(true);
            setLastPanPos({ x: e.evt.clientX, y: e.evt.clientY });
            return;
          }

          const pointer = stageRef.current.getPointerPosition();
          const pos = {
            x: (pointer.x - stagePosition.x) / stageScale,
            y: (pointer.y - stagePosition.y) / stageScale,
          };
          setMouseDownPoint(pos);
          if (mode === "DRAW" && !drawing) {
            setDrawing(true);
            setCurrentPoints([]);
          }
        }}
        onMouseMove={(e) => {
          const pointer = stageRef.current.getPointerPosition();
          if (!pointer) return;

          const pos = {
            x: (pointer.x - stagePosition.x) / stageScale,
            y: (pointer.y - stagePosition.y) / stageScale,
          };
          setMousePos(pos);

          if (isPanning && lastPanPos) {
            const dx = e.evt.clientX - lastPanPos.x;
            const dy = e.evt.clientY - lastPanPos.y;
            setStagePosition((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
            setLastPanPos({ x: e.evt.clientX, y: e.evt.clientY });
            return;
          }

          if (mode === "DRAW") {
            if (mouseDownPoint) {
              const dx = pos.x - mouseDownPoint.x;
              const dy = pos.y - mouseDownPoint.y;
              setPreviewPoint({
                id: uuidv4(),
                x: mouseDownPoint.x,
                y: mouseDownPoint.y,
                handleLeft: { x: mouseDownPoint.x - dx, y: mouseDownPoint.y - dy },
                handleRight: { x: mouseDownPoint.x + dx, y: mouseDownPoint.y + dy },
              });
            } else if (drawing && currentPoints.length > 0) {
              const potentialSnapPoints = [
                ...currentPoints,
                ...paths.flatMap((p) => p.points),
              ];
              const lockedPoint = potentialSnapPoints.find(
                (p) => Math.hypot(p.x - pos.x, p.y - pos.y) < SNAPPING_THRESHOLD
              );
              if (lockedPoint) {
                setPreviewPoint(lockedPoint); // ✅ Reuse the snapped point
              } else {
                setPreviewPoint({
                  id: uuidv4(),
                  x: pos.x,
                  y: pos.y,
                });
              }
            }
          }
        }}
        onMouseUp={() => {
          if (isPanning) {
            setIsPanning(false);
            setLastPanPos(null);
            return;
          }

          if (!mouseDownPoint) {
            setPreviewPoint(null);
            return;
          }

          if (previewPoint) {
            setCurrentPoints((prev) => {
              const alreadyExists = prev.find(p => p.id === previewPoint.id);
              if (alreadyExists) {
                // Update its handles if they were dragged into place
                return prev.map(p =>
                  p.id === previewPoint.id
                    ? {
                      ...p,
                      handleLeft: previewPoint.handleLeft,
                      handleRight: previewPoint.handleRight,
                    }
                    : p
                );
              }
              return [...prev, previewPoint];
            });
          }

          setPreviewPoint(null);
          setMouseDownPoint(null);
        }}
        onDblClick={handleDoubleClick}
      >
        <Layer>
          {status === "loaded" && backgroundImage && (
            <KonvaImage
              image={backgroundImage}
              x={imageOffset.x}
              y={imageOffset.y}
              width={backgroundImage.width * imageScale}
              height={backgroundImage.height * imageScale}
              opacity={1}
              listening={false}
            />
          )}

          {[...Array(100)].map((_, i) => (
            <Rect key={`v-${i}`} x={i * 100} y={0} width={1} height={10000} fill="#ddd" />
          ))}
          {[...Array(100)].map((_, i) => (
            <Rect key={`h-${i}`} x={0} y={i * 100} width={10000} height={1} fill="#ddd" />
          ))}

          <PathRenderer
            paths={paths}
            currentPoints={currentPoints}
            previewPoint={previewPoint}
            selectedPointId={selectedPointId}
            draggingAnchorId={draggingAnchorId}
            draggingHandle={draggingHandle}
            mousePos={mousePos}
            mode={mode}
            onAnchorDragMove={onAnchorDragMove}
            onHandleDragMove={onHandleDragMove}
            onAnchorSelect={setSelectedPointId}
          />
        </Layer>
      </Stage>
    </>
  );
}