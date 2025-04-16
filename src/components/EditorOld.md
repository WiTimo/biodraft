// src/components/Editor.tsx
import { useRef, useState, useEffect, Fragment } from "react";
import { Stage, Layer, Shape, Rect, Circle, Line } from "react-konva";
import { v4 as uuidv4 } from "uuid";
import useImage from "use-image";
import { Image as KonvaImage } from "react-konva";

// ---- Basic Style Constants (You can adjust these as needed) ----
const HANDLE_COLOR = "#ff8800";
const LINE_COLOR = "#000";
const POINT_COLOR = "#0055ff";
const POINT_OUTLINE_COLOR = "#00f";
const PREVIEW_LINE_COLOR = "#88f";

type Handle = { x: number; y: number };
type BezierPoint = {
  id: string;
  x: number;
  y: number;
  handleLeft?: Handle;
  handleRight?: Handle;
};

type Path = {
  id: string;
  points: BezierPoint[];
  closed: boolean;
};

type Mode = "DRAW" | "SELECT";

export default function Editor() {
  const stageRef = useRef<any>(null);

  // Zoom & Pan
  const [stageScale, setStageScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });

  // Background Image
  const [backgroundImage, status] = useImage("/test.png");
  const [imageScale, setImageScale] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });

  // Paths and Points
  const [paths, setPaths] = useState<Path[]>([]);
  const [currentPoints, setCurrentPoints] = useState<BezierPoint[]>([]);
  const [drawing, setDrawing] = useState(false);

  // Selection / Interaction
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [draggingAnchorId, setDraggingAnchorId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // For Panning
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);

  // Preview Point for Live Segment
  const [previewPoint, setPreviewPoint] = useState<BezierPoint | null>(null);

  // Mode Switching
  const [mode, setMode] = useState<Mode>("DRAW");

  // Undo / Redo
  const [history, setHistory] = useState<BezierPoint[][]>([]);
  const [redoStack, setRedoStack] = useState<BezierPoint[][]>([]);

  // -----------------------------
  // 1. On component mount, set up the background image scale & offset
  useEffect(() => {
    if (status === "loaded" && backgroundImage) {
      const imageAspect = backgroundImage.width / backgroundImage.height;
      const canvasAspect = window.innerWidth / window.innerHeight;
      const scale =
        canvasAspect > imageAspect
          ? window.innerHeight / backgroundImage.height
          : window.innerWidth / backgroundImage.width;
      const imgWidth = backgroundImage.width * scale;
      const imgHeight = backgroundImage.height * scale;
      const offsetX = (window.innerWidth - imgWidth) / 2;
      const offsetY = (window.innerHeight - imgHeight) / 2;
      setImageScale(scale);
      setImageOffset({ x: offsetX, y: offsetY });
    }
  }, [status, backgroundImage]);

  // 2. Utility - Deep Copy
  const deepCopyPoints = (points: BezierPoint[]): BezierPoint[] =>
    points.map((p) => ({
      ...p,
      handleLeft: p.handleLeft ? { ...p.handleLeft } : undefined,
      handleRight: p.handleRight ? { ...p.handleRight } : undefined,
    }));

  // 3. Push to History (for Undo/Redo)
  const pushToHistory = () => {
    setHistory((prev) => [...prev, deepCopyPoints(currentPoints)]);
    setRedoStack([]);
  };

  // 4. Export to JSON
  const exportPathsToJson = () => {
    const json = JSON.stringify(paths, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clothing-paths.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // 5. Zoom and Pan (via mouse wheel, ctrl/drag, etc.)
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

  // 6. MouseDown Logic
  //    If in DRAW mode, we connect to an existing point or create new.
  //    If in SELECT mode, we select an existing point or clear selection.
  const handleStageMouseDown = (e: any) => {
    if (e.evt.button === 2) return; // skip right-click
    if (e.evt.ctrlKey || e.evt.metaKey) {
      // Start panning
      setIsPanning(true);
      setLastPanPos({ x: e.evt.clientX, y: e.evt.clientY });
      return;
    }
    const pointer = stageRef.current.getPointerPosition();
    const clickedPos = {
      x: (pointer.x - stagePosition.x) / stageScale,
      y: (pointer.y - stagePosition.y) / stageScale,
    };

    if (mode === "SELECT") {
      // If user clicks on a circle, select that point; otherwise, clear selection
      if (e.target && e.target.getClassName() === "Circle") {
        const clickedId = e.target.attrs.id;
        setSelectedPointId(clickedId);
      } else {
        setSelectedPointId(null);
      }
      return;
    }

    // DRAW mode
    const threshold = 10;
    const existingPoint = [
      ...currentPoints,
      ...paths.flatMap((p) => p.points),
    ].find(
      (p) => Math.hypot(p.x - clickedPos.x, p.y - clickedPos.y) < threshold
    );
    const newPoint: BezierPoint = existingPoint
      ? existingPoint
      : { id: uuidv4(), x: clickedPos.x, y: clickedPos.y };

    setPreviewPoint(newPoint);
    setSelectedPointId(newPoint.id);

    if (!drawing) {
      setCurrentPoints([newPoint]);
      setDrawing(true);
    }
  };

  // 7. MouseMove Logic
  //    If panning, update stage position; if drawing, update preview handle.
  const handleStageMouseMove = (e: any) => {
    const pointer = stageRef.current.getPointerPosition();
    if (!pointer) return;
    const pos = {
      x: (pointer.x - stagePosition.x) / stageScale,
      y: (pointer.y - stagePosition.y) / stageScale,
    };
    setMousePos(pos);

    // Panning
    if (isPanning && lastPanPos) {
      const dx = e.evt.clientX - lastPanPos.x;
      const dy = e.evt.clientY - lastPanPos.y;
      setStagePosition((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPanPos({ x: e.evt.clientX, y: e.evt.clientY });
    }

    // Only update the preview point if in DRAW mode
    if (mode === "DRAW" && previewPoint) {
      const dx = pos.x - previewPoint.x;
      const dy = pos.y - previewPoint.y;
      const handleRight = { x: previewPoint.x + dx, y: previewPoint.y + dy };
      const handleLeft = { x: previewPoint.x - dx, y: previewPoint.y - dy };
      setPreviewPoint({ ...previewPoint, handleLeft, handleRight });
    }
  };

  // 8. MouseUp Logic
  //    Stop panning or, if we are drawing, finalize the preview point.
  const handleStageMouseUp = (e: any) => {
    if (isPanning) {
      setIsPanning(false);
      setLastPanPos(null);
      return;
    }
    if (mode === "DRAW" && previewPoint && drawing) {
      pushToHistory();
      setCurrentPoints((prev) => [...prev, previewPoint]);
      setSelectedPointId(previewPoint.id);
    }
    setPreviewPoint(null);
  };

  // 9. DoubleClick = finalize the path
  const handleStageDblClick = () => {
    if (currentPoints.length > 1) {
      setPaths((prev) => [
        ...prev,
        {
          id: uuidv4(),
          points: currentPoints,
          closed: true,
        },
      ]);
    }
    setCurrentPoints([]);
    setDrawing(false);
  };

  // 10. KeyDown for Undo/Redo & Deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const ctrl = isMac ? e.metaKey : e.ctrlKey;

      // Undo
      if (ctrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        setHistory((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          setRedoStack((r) => [deepCopyPoints(currentPoints), ...r]);
          setCurrentPoints(last);
          return prev.slice(0, -1);
        });
      }

      // Redo
      if (ctrl && (e.key === "Z" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        setRedoStack((prev) => {
          if (prev.length === 0) return prev;
          const [next, ...rest] = prev;
          setHistory((h) => [...h, deepCopyPoints(currentPoints)]);
          setCurrentPoints(next);
          return rest;
        });
      }

      // Delete selected point (only in SELECT mode)
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedPointId &&
        mode === "SELECT"
      ) {
        e.preventDefault();
        // Remove from currentPoints
        setCurrentPoints((prev) =>
          prev.filter((p) => p.id !== selectedPointId)
        );
        // Also remove from completed paths
        setPaths((prevPaths) =>
          prevPaths.map((pth) => ({
            ...pth,
            points: pth.points.filter((p) => p.id !== selectedPointId),
          }))
        );
        setSelectedPointId(null);
        pushToHistory();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // disable right-click
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [currentPoints, selectedPointId, mode, paths]);

  return (
    <>
      {/* Export & Mode Buttons */}
      <button
        onClick={exportPathsToJson}
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1000,
          padding: "8px 12px",
          backgroundColor: "#333",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Export to JSON
      </button>
      <div style={{ position: "absolute", top: 50, left: 10, zIndex: 1000 }}>
        <button
          onClick={() => setMode("DRAW")}
          style={{
            padding: "8px 12px",
            marginRight: "8px",
            backgroundColor: mode === "DRAW" ? "#555" : "#aaa",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Draw Mode
        </button>
        <button
          onClick={() => setMode("SELECT")}
          style={{
            padding: "8px 12px",
            backgroundColor: mode === "SELECT" ? "#555" : "#aaa",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Select Mode
        </button>
      </div>

      {/* Main Stage */}
      <Stage
        width={window.innerWidth}
        height={window.innerHeight}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePosition.x}
        y={stagePosition.y}
        ref={stageRef}
        style={{ background: "#f0f0f0", cursor: mode === "DRAW" ? "crosshair" : "default" }}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onDblClick={handleStageDblClick}
      >
        <Layer>
          {/* Background Image */}
          {status === "loaded" && backgroundImage && (
            <KonvaImage
              image={backgroundImage}
              x={imageOffset.x}
              y={imageOffset.y}
              width={backgroundImage.width * imageScale}
              height={backgroundImage.height * imageScale}
              listening={false}
            />
          )}

          {/* Draw a simple grid (optional) */}
          {[...Array(50)].map((_, i) => (
            <Rect
              key={`v-${i}`}
              x={i * 100}
              y={0}
              width={1}
              height={5000}
              fill="#ddd"
              listening={false}
            />
          ))}
          {[...Array(50)].map((_, i) => (
            <Rect
              key={`h-${i}`}
              x={0}
              y={i * 100}
              width={5000}
              height={1}
              fill="#ddd"
              listening={false}
            />
          ))}

          {/* Completed Paths (always visible) */}
          {paths.map((path) => (
            <Shape
              key={path.id}
              sceneFunc={(ctx, shape) => {
                const pts = path.points;
                if (pts.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) {
                  const p0 = pts[i - 1];
                  const p1 = pts[i];
                  ctx.bezierCurveTo(
                    p0.handleRight?.x ?? p0.x,
                    p0.handleRight?.y ?? p0.y,
                    p1.handleLeft?.x ?? p1.x,
                    p1.handleLeft?.y ?? p1.y,
                    p1.x,
                    p1.y
                  );
                }
                if (path.closed) {
                  const last = pts[pts.length - 1];
                  const first = pts[0];
                  ctx.bezierCurveTo(
                    last.handleRight?.x ?? last.x,
                    last.handleRight?.y ?? last.y,
                    first.handleLeft?.x ?? first.x,
                    first.handleLeft?.y ?? first.y,
                    first.x,
                    first.y
                  );
                }
                ctx.strokeShape(shape);
              }}
              stroke={LINE_COLOR}
              strokeWidth={2}
              listening={false}
            />
          ))}

          {/* Current (In-Progress) Path: always visible if drawing is true and at least 2 points */}
          {currentPoints.length > 1 && (
            <Shape
              sceneFunc={(ctx, shape) => {
                const pts = currentPoints;
                if (pts.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) {
                  const p0 = pts[i - 1];
                  const p1 = pts[i];
                  ctx.bezierCurveTo(
                    p0.handleRight?.x ?? p0.x,
                    p0.handleRight?.y ?? p0.y,
                    p1.handleLeft?.x ?? p1.x,
                    p1.handleLeft?.y ?? p1.y,
                    p1.x,
                    p1.y
                  );
                }
                ctx.strokeShape(shape);
              }}
              stroke={LINE_COLOR}
              dash={mode === "DRAW" ? [10, 5] : undefined}
              strokeWidth={2}
              listening={false}
            />
          )}

          {/* Live preview segment: shown only in DRAW mode if we have a previewPoint */}
          {mode === "DRAW" && drawing && currentPoints.length > 0 && previewPoint && (
            <Shape
              sceneFunc={(ctx, shape) => {
                const p0 = currentPoints[currentPoints.length - 1];
                const p1 = previewPoint;
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.bezierCurveTo(
                  p0.handleRight?.x ?? p0.x,
                  p0.handleRight?.y ?? p0.y,
                  p1.handleLeft?.x ?? p1.x,
                  p1.handleLeft?.y ?? p1.y,
                  p1.x,
                  p1.y
                );
                ctx.strokeShape(shape);
              }}
              stroke={PREVIEW_LINE_COLOR}
              strokeWidth={2}
              dash={[10, 4]}
              listening={false}
            />
          )}

          {/* Render Points (both current and from completed paths). Also, optionally render the previewPoint if it exists */}
          {[...currentPoints, ...paths.flatMap((p) => p.points), ...(previewPoint ? [previewPoint] : [])].map(
            (point) => (
              <Fragment key={point.id}>
                {/* Outline for the anchor if it's selected */}
                <Circle
                  x={point.x}
                  y={point.y}
                  radius={6}
                  stroke={selectedPointId === point.id ? POINT_OUTLINE_COLOR : "transparent"}
                  strokeWidth={selectedPointId === point.id ? 1 : 0}
                  listening={false}
                />
                {/* Main anchor circle */}
                <Circle
                  id={point.id}
                  x={point.x}
                  y={point.y}
                  radius={4}
                  fill={POINT_COLOR}
                  draggable={mode === "SELECT"}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    setSelectedPointId(point.id);
                  }}
                  onDragStart={() => setDraggingAnchorId(point.id)}
                  onDragEnd={() => setDraggingAnchorId(null)}
                  onDragMove={(e) => {
                    const pos = e.target.position();
                    setCurrentPoints((prev) =>
                      prev.map((p) =>
                        p.id === point.id
                          ? {
                              ...p,
                              x: pos.x,
                              y: pos.y,
                              handleLeft: p.handleLeft
                                ? {
                                    x: pos.x + (p.handleLeft.x - p.x),
                                    y: pos.y + (p.handleLeft.y - p.y),
                                  }
                                : undefined,
                              handleRight: p.handleRight
                                ? {
                                    x: pos.x + (p.handleRight.x - p.x),
                                    y: pos.y + (p.handleRight.y - p.y),
                                  }
                                : undefined,
                            }
                          : p
                      )
                    );
                  }}
                />

                {/* If this point is selected, show the handles */}
                {point.id === selectedPointId && (
                  <>
                    {/* Left handle + line */}
                    {point.handleLeft && (
                      <>
                        <Line
                          points={[point.x, point.y, point.handleLeft.x, point.handleLeft.y]}
                          stroke={HANDLE_COLOR}
                          listening={false}
                        />
                        <Circle
                          x={point.handleLeft.x}
                          y={point.handleLeft.y}
                          radius={4}
                          fill={HANDLE_COLOR}
                          draggable={mode === "SELECT"}
                          onClick={(e) => {
                            e.cancelBubble = true;
                            setSelectedPointId(point.id);
                          }}
                          onDragMove={(e) => {
                            const altKey = e.evt.altKey;
                            const pos = e.target.position();
                            setCurrentPoints((prev) =>
                              prev.map((p) => {
                                if (p.id !== point.id) return p;
                                const newHandleLeft = { x: pos.x, y: pos.y };
                                // Mirror if user isn't pressing Alt
                                if (!p.handleRight || altKey) {
                                  return { ...p, handleLeft: newHandleLeft };
                                }
                                // Mirror
                                const dx = newHandleLeft.x - p.x;
                                const dy = newHandleLeft.y - p.y;
                                const mirroredRight = {
                                  x: p.x - dx,
                                  y: p.y - dy,
                                };
                                return {
                                  ...p,
                                  handleLeft: newHandleLeft,
                                  handleRight: mirroredRight,
                                };
                              })
                            );
                          }}
                        />
                      </>
                    )}

                    {/* Right handle + line */}
                    {point.handleRight && (
                      <>
                        <Line
                          points={[point.x, point.y, point.handleRight.x, point.handleRight.y]}
                          stroke={HANDLE_COLOR}
                          listening={false}
                        />
                        <Circle
                          x={point.handleRight.x}
                          y={point.handleRight.y}
                          radius={4}
                          fill={HANDLE_COLOR}
                          draggable={mode === "SELECT"}
                          onClick={(e) => {
                            e.cancelBubble = true;
                            setSelectedPointId(point.id);
                          }}
                          onDragMove={(e) => {
                            const altKey = e.evt.altKey;
                            const pos = e.target.position();
                            setCurrentPoints((prev) =>
                              prev.map((p) => {
                                if (p.id !== point.id) return p;
                                const newHandleRight = { x: pos.x, y: pos.y };
                                // Mirror if user isn't pressing Alt
                                if (!p.handleLeft || altKey) {
                                  return { ...p, handleRight: newHandleRight };
                                }
                                // Mirror
                                const dx = newHandleRight.x - p.x;
                                const dy = newHandleRight.y - p.y;
                                const mirroredLeft = {
                                  x: p.x - dx,
                                  y: p.y - dy,
                                };
                                return {
                                  ...p,
                                  handleRight: newHandleRight,
                                  handleLeft: mirroredLeft,
                                };
                              })
                            );
                          }}
                        />
                      </>
                    )}
                  </>
                )}
              </Fragment>
            )
          )}
        </Layer>
      </Stage>
    </>
  );
}