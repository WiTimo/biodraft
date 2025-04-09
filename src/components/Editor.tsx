import { useRef, useState, useEffect, Fragment } from "react";
import { Stage, Layer, Shape, Rect, Circle, Line } from "react-konva";
import { v4 as uuidv4 } from "uuid";

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

export default function Editor() {
  const stageRef = useRef<any>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });

  const [paths, setPaths] = useState<Path[]>([]);
  const [currentPoints, setCurrentPoints] = useState<BezierPoint[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);
  const [previewPoint, setPreviewPoint] = useState<BezierPoint | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [draggingAnchorId, setDraggingAnchorId] = useState<string | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<{
    pointId: string;
    handle: "left" | "right";
  } | null>(null);

  const [dragPreview, setDragPreview] = useState<{
    start: BezierPoint;
    current: { x: number; y: number };
  } | null>(null);

  const [history, setHistory] = useState<BezierPoint[][]>([]);
  const [redoStack, setRedoStack] = useState<BezierPoint[][]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);


  const pushToHistory = () => {
    setHistory((prev) => [...prev, deepCopyPoints(currentPoints)]);
    setRedoStack([]); // Clear redo stack on new action
  };


  const deepCopyPoints = (points: BezierPoint[]): BezierPoint[] =>
    points.map((p) => ({
      ...p,
      handleLeft: p.handleLeft ? { ...p.handleLeft } : undefined,
      handleRight: p.handleRight ? { ...p.handleRight } : undefined,
    }));



  // Zoom and pan
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

  // Click to place anchor, drag to define handle
  const [mouseDownPoint, setMouseDownPoint] = useState<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: any) => {
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    const point = {
      x: (pointer.x - stagePosition.x) / stageScale,
      y: (pointer.y - stagePosition.y) / stageScale,
    };

    setMouseDownPoint(point);
  };

  const handleMouseUp = (e: any) => {
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    const upPoint = {
      x: (pointer.x - stagePosition.x) / stageScale,
      y: (pointer.y - stagePosition.y) / stageScale,
    };

    if (!mouseDownPoint) return;

    const dx = upPoint.x - mouseDownPoint.x;
    const dy = upPoint.y - mouseDownPoint.y;

    const handleRight = { x: mouseDownPoint.x + dx, y: mouseDownPoint.y + dy };
    const handleLeft = { x: mouseDownPoint.x - dx, y: mouseDownPoint.y - dy };

    const bezierPoint: BezierPoint = {
      x: mouseDownPoint.x,
      y: mouseDownPoint.y,
      handleLeft,
      handleRight,
      id: uuidv4(),
    };

    if (!drawing) {
      setCurrentPoints([bezierPoint]);
      setDrawing(true);
    } else {
      setCurrentPoints((prev) => [...prev, bezierPoint]);
    }

    setMouseDownPoint(null);
  };

  const handleDoubleClick = () => {
    if (currentPoints.length > 1) {
      setPaths((prev) => [
        ...prev,
        { id: uuidv4(), points: currentPoints, closed: true },
      ]);
    }
    setCurrentPoints([]);
    setDrawing(false);
  };

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
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPoints]);


  return (
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
        if (e.evt.ctrlKey || e.evt.metaKey) {
          setIsPanning(true);
          setLastPanPos({ x: e.evt.clientX, y: e.evt.clientY });
          return;
        }

        // ✅ If clicked on a shape (not the background), don't place a point
        if (e.target && e.target.getClassName() !== "Stage") {
          return;
        }

        // Otherwise, deselect and place a new point
        setSelectedPointId(null);

        const stage = stageRef.current;
        const pointer = stage.getPointerPosition();
        const point = {
          x: (pointer.x - stagePosition.x) / stageScale,
          y: (pointer.y - stagePosition.y) / stageScale,
        };

        const newPoint: BezierPoint = {
          id: uuidv4(),
          x: point.x,
          y: point.y,
        };

        setPreviewPoint(newPoint);
        setSelectedPointId(newPoint.id); // ✅ Also select it immediately!

        if (!drawing) {
          setCurrentPoints([newPoint]);
          setDrawing(true);
        }
      }}




      onMouseMove={(e) => {
        const pointer = stageRef.current.getPointerPosition();

        const pos = {
          x: (pointer.x - stagePosition.x) / stageScale,
          y: (pointer.y - stagePosition.y) / stageScale,
        };
        if (pointer) {
          setMousePos(pos);
        }
        if (isPanning && lastPanPos) {
          const dx = e.evt.clientX - lastPanPos.x;
          const dy = e.evt.clientY - lastPanPos.y;
          setStagePosition((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
          setLastPanPos({ x: e.evt.clientX, y: e.evt.clientY });
        }

        if (previewPoint) {
          const dx = pos.x - previewPoint.x;
          const dy = pos.y - previewPoint.y;

          const handleRight = { x: previewPoint.x + dx, y: previewPoint.y + dy };
          const handleLeft = { x: previewPoint.x - dx, y: previewPoint.y - dy };

          setPreviewPoint({ ...previewPoint, handleLeft, handleRight });
        }
      }}

      onMouseUp={(e) => {
        if (isPanning) {
          setIsPanning(false);
          setLastPanPos(null);
        } else {
          handleMouseUp(e); // <- You can actually remove this now if it's no longer needed
        }

        if (previewPoint && drawing) {
          pushToHistory(); // ← Before state change
          setCurrentPoints((prev) => [...prev, previewPoint]);
          setSelectedPointId(previewPoint.id);
        }

        setPreviewPoint(null);
      }}

      onDblClick={handleDoubleClick}
      style={{ background: "#f0f0f0" }}
    >
      <Layer>
        {/* Grid */}
        {[...Array(100)].map((_, i) => (
          <Rect
            key={`v-${i}`}
            x={i * 100}
            y={0}
            width={1}
            height={10000}
            fill="#ddd"
          />
        ))}
        {[...Array(100)].map((_, i) => (
          <Rect
            key={`h-${i}`}
            x={0}
            y={i * 100}
            width={10000}
            height={1}
            fill="#ddd"
          />
        ))}

        {/* Render saved Bézier paths */}
        {paths.map((path) => (
          <Shape
            key={path.id}
            sceneFunc={(ctx, shape) => {
              const points = path.points;
              if (points.length < 2) return;

              ctx.beginPath();
              ctx.moveTo(points[0].x, points[0].y);
              for (let i = 1; i < points.length; i++) {
                const p0 = points[i - 1];
                const p1 = points[i];
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
                const last = points[points.length - 1];
                const first = points[0];
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
            stroke="black"
            strokeWidth={2}
          />
        ))}

        {/* Render in-progress Bézier path */}
        {drawing && currentPoints.length > 1 && (
          <Shape
            sceneFunc={(ctx, shape) => {
              const points = currentPoints;
              ctx.beginPath();
              ctx.moveTo(points[0].x, points[0].y);
              for (let i = 1; i < points.length; i++) {
                const p0 = points[i - 1];
                const p1 = points[i];
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
            stroke="blue"
            dash={[10, 5]}
            strokeWidth={2}
          />
        )}
        {/* Live preview while dragging */}
        {drawing && currentPoints.length > 0 && previewPoint && (
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
            stroke="blue"
            strokeWidth={2}
            dash={[10, 4]}
          />
        )}

        {drawing && currentPoints.length > 0 && mousePos && !previewPoint && (
          <Shape
            listening={false}
            sceneFunc={(ctx, shape) => {
              const lastPoint = currentPoints[currentPoints.length - 1];
              const lastHandle = lastPoint.handleRight ?? {
                x: lastPoint.x + 100,
                y: lastPoint.y,
              };

              // Direction from last point to its handle
              const dx = lastHandle.x - lastPoint.x;
              const dy = lastHandle.y - lastPoint.y;

              // Start handle: follow existing direction
              const handleStart = {
                x: lastPoint.x + dx,
                y: lastPoint.y + dy,
              };

              // End handle: point back toward the last point (gentle "aiming")
              const backDx = lastPoint.x - mousePos.x;
              const backDy = lastPoint.y - mousePos.y;
              const backLen = Math.sqrt(backDx * backDx + backDy * backDy);
              const scale = 0.3; // less aggressive handle

              const handleEnd = {
                x: mousePos.x + (backDx / backLen) * 100 * scale,
                y: mousePos.y + (backDy / backLen) * 100 * scale,
              };

              ctx.beginPath();
              ctx.moveTo(lastPoint.x, lastPoint.y);
              ctx.bezierCurveTo(
                handleStart.x,
                handleStart.y,
                handleEnd.x,
                handleEnd.y,
                mousePos.x,
                mousePos.y
              );
              ctx.strokeShape(shape);
            }}
            stroke="orange"
            strokeWidth={2}
            dash={[4, 3]}
          />
        )}





        {/* Render handles & points */}
        {[...currentPoints, ...paths.flatMap(p => p.points), ...(previewPoint ? [previewPoint] : [])].map((point, idx) => (
          <Fragment key={`${point.id}-${idx}`}>
            {/* Anchor point */}
            <Circle
              x={point.x}
              y={point.y}
              radius={4}
              fill="blue"
              draggable
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


            {/* Handles if selected */}
            {point.id === selectedPointId && (
              <>
                {point.handleLeft && (point.id === selectedPointId || point === previewPoint) && (
                  <>
                    <Line
                      points={[point.x, point.y, point.handleLeft.x, point.handleLeft.y]}
                      stroke="gray"
                    />
                    <Circle
                      x={point.handleLeft.x}
                      y={point.handleLeft.y}
                      radius={3}
                      fill="gray"
                      draggable
                      onDragStart={() => {
                        pushToHistory();
                        setDraggingHandle({ pointId: point.id, handle: "left" })
                      }}
                      onDragEnd={() => {
                        setDraggingHandle(null);
                      }}

                      onDragMove={(e) => {
                        const pos = e.target.position();
                        const altKey = e.evt.altKey;

                        setCurrentPoints((prev) =>
                          prev.map((p) => {
                            if (p.id !== point.id) return p;

                            const newHandleLeft = { x: pos.x, y: pos.y };

                            if (altKey || !p.handleRight) {
                              return { ...p, handleLeft: newHandleLeft };
                            }

                            // Symmetric mirroring:
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
                {point.handleRight && (point.id === selectedPointId || point === previewPoint) && (
                  <>
                    <Line
                      points={[point.x, point.y, point.handleRight.x, point.handleRight.y]}
                      stroke="gray"
                    />
                    <Circle
                      x={point.handleRight.x}
                      y={point.handleRight.y}
                      radius={3}
                      fill="gray"
                      draggable
                      onDragStart={() => {
                        pushToHistory();
                        setDraggingHandle({ pointId: point.id, handle: "right" })
                      }}
                      onDragEnd={() => setDraggingHandle(null)}
                      onDragMove={(e) => {
                        const pos = e.target.position();
                        const altKey = e.evt.altKey;

                        setCurrentPoints((prev) =>
                          prev.map((p) => {
                            if (p.id !== point.id) return p;

                            const newHandleRight = { x: pos.x, y: pos.y };

                            if (altKey || !p.handleLeft) {
                              return { ...p, handleRight: newHandleRight };
                            }

                            // Symmetric mirroring:
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
        ))}
      </Layer>
    </Stage>
  );
}
