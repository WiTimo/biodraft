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

  const [mouseDragged, setMouseDragged] = useState(false);

  const [paths, setPaths] = useState<Path[]>([]);
  const [currentPoints, setCurrentPoints] = useState<BezierPoint[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [mouseDownPoint, setMouseDownPoint] = useState<{ x: number; y: number } | null>(null);
  const [previewPoint, setPreviewPoint] = useState<BezierPoint | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);
  const [lockedSnapPoint, setLockedSnapPoint] = useState<BezierPoint | null>(null);
  const [mode, setMode] = useState<Mode>("DRAW");
  const [drawStartPoint, setDrawStartPoint] = useState<BezierPoint | null>(null);

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        setCurrentPoints((prev) => prev.filter((p) => p.id !== selectedPointId));
        setSelectedPointId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, selectedPointId, setCurrentPoints]);

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
          onClick={() => {
            setMode("DRAW");

            const allPoints = [...currentPoints, ...paths.flatMap(p => p.points)];
            const selected = allPoints.find(p => p.id === selectedPointId);

            if (selected) {
              console.log('Starting Point when switching to draw')
              setDrawStartPoint(selected);
            } else {
              setDrawStartPoint(null);
            }

            setDrawing(true);
          }}
          style={{ marginRight: 8, backgroundColor: mode === "DRAW" ? "#666" : "#ccc" }}
        >
          Draw
        </button>
        <button
          onClick={() => {
            setMode("SELECT");
            setDrawing(false);
            setMouseDownPoint(null);
            setPreviewPoint(null);
            setLockedSnapPoint(null);
          }}
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

          const snapped = lockedSnapPoint;

          const targetPoint = snapped
            ? {
              id: snapped.id,
              x: snapped.x,
              y: snapped.y,
              // 🔥 override handles so the user defines a new connection shape
              handleLeft: undefined,
              handleRight: undefined,
            }
            : {
              id: uuidv4(),
              x: pos.x,
              y: pos.y,
            };

          setMouseDownPoint(targetPoint);


          if (mode === "DRAW" && !drawing) {
            const newPoint = {
              ...targetPoint,
              handleLeft: undefined,
              handleRight: undefined,
            };

            setCurrentPoints([newPoint]);
            setDrawing(true);
            setMouseDragged(false);
            return;
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

              if (Math.hypot(dx, dy) > 1) {
                setMouseDragged(true);
              }

              setPreviewPoint({
                id: uuidv4(),
                x: mouseDownPoint.x,
                y: mouseDownPoint.y,
                handleLeft: { x: mouseDownPoint.x - dx, y: mouseDownPoint.y - dy },
                handleRight: { x: mouseDownPoint.x + dx, y: mouseDownPoint.y + dy },
              });
            } 
            else if (drawing && currentPoints.length > 0) {
              const potentialSnapPoints = [
                ...currentPoints,
                ...paths.flatMap((p) => p.points),
              ];
              const lockedPoint = potentialSnapPoints.find(
                (p) => Math.hypot(p.x - pos.x, p.y - pos.y) < SNAPPING_THRESHOLD
              );

              if (lockedPoint) {
                setLockedSnapPoint(lockedPoint);
                setPreviewPoint({
                  id: uuidv4(),
                  x: lockedPoint.x,
                  y: lockedPoint.y,
                  handleLeft: undefined,
                  handleRight: undefined,
                });
              } else {
                setLockedSnapPoint(null);
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
              let updated = [...prev];

              if (drawStartPoint && updated.length === 0) {
                updated.push({ ...drawStartPoint });
              }

              const alreadyExists = updated.find((p) => p.id === previewPoint.id);
              const shouldAdd = !alreadyExists || mouseDragged;

              if (!shouldAdd) return updated;

              if (alreadyExists) {
                return updated.map((p) =>
                  p.id === previewPoint.id
                    ? {
                      ...p,
                      handleLeft: previewPoint.handleLeft,
                      handleRight: previewPoint.handleRight,
                    }
                    : p
                );
              }

              return [
                ...updated,
                {
                  ...previewPoint,
                  handleLeft: previewPoint.handleLeft ? { ...previewPoint.handleLeft } : undefined,
                  handleRight: previewPoint.handleRight ? { ...previewPoint.handleRight } : undefined,
                },
              ];
            });

            setDrawStartPoint(null); // ✅ reset after use
          }

          setMouseDragged(false); // 🔁 reset
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
            drawStartPoint={drawStartPoint}
            onAnchorDragMove={onAnchorDragMove}
            onHandleDragMove={onHandleDragMove}
            onAnchorSelect={setSelectedPointId}
          />
        </Layer>
      </Stage>
    </>
  );
}