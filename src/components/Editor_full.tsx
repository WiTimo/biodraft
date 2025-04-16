import { useRef, useState, useEffect, Fragment } from "react";
import { Stage, Layer, Shape, Rect, Circle, Line } from "react-konva";
import { v4 as uuidv4 } from "uuid";
import { HANDLE_COLOR, LINE_COLOR, POINT_COLOR, POINT_OUTLINE_COLOR, PREVIEW_LINE_COLOR } from "../lib/colors";
import useImage from "use-image";
import { Image as KonvaImage } from "react-konva";

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

type Mode = 'DRAW' | 'SELECT';

const SNAPPING_THRESHOLD = 20;

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

    const [mode, setMode] = useState<Mode>('DRAW');

    useEffect(() => {
        if (status === "loaded" && backgroundImage) {
            const imageAspect = backgroundImage.width / backgroundImage.height;
            const canvasAspect = window.innerWidth / window.innerHeight;

            const scale = canvasAspect > imageAspect
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


    const pushToHistory = () => {
        setHistory((prev) => [...prev, deepCopyPoints(currentPoints)]);
        setRedoStack([]); // Clear redo stack on new action
    };

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
            // Delete selected point
            if ((e.key === "Delete" || e.key === "Backspace") && selectedPointId) {
                e.preventDefault();
                setCurrentPoints((prev) =>
                    prev.filter((p) => p.id !== selectedPointId)
                );
                setSelectedPointId(null);
                pushToHistory(); // Optional: store in undo stack
            }
        };

        const disableContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("contextmenu", disableContextMenu);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("contextmenu", disableContextMenu);
        };
    }, [currentPoints]);


    return (
        <>
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
            <Stage
                width={window.innerWidth}
                height={window.innerHeight}
                scaleX={stageScale}
                scaleY={stageScale}
                x={stagePosition.x}
                y={stagePosition.y}
                ref={stageRef}
                style={{
                    background: "#f0f0f0",
                    cursor: mode === "DRAW" ? "crosshair" : "default",
                }}
                onWheel={handleWheel}
                onMouseDown={(e) => {
                    if (e.evt.button === 2) return; // Skip right-click

                    if (e.evt.ctrlKey || e.evt.metaKey) {
                        setIsPanning(true);
                        setLastPanPos({ x: e.evt.clientX, y: e.evt.clientY });
                        return;
                    }

                    const pointer = stageRef.current.getPointerPosition();
                    const clickedPoint = {
                        x: (pointer.x - stagePosition.x) / stageScale,
                        y: (pointer.y - stagePosition.y) / stageScale,
                    };

                    setMouseDownPoint(clickedPoint);

                    if (mode === "SELECT") {
                        if (e.target && e.target.getClassName() === "Circle") {
                            const clickedId = e.target.attrs.id;
                            setSelectedPointId(clickedId);
                        } else {
                            setSelectedPointId(null);
                        }
                        return;
                    }

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

                            setPreviewPoint(
                                lockedPoint
                                    ? { id: uuidv4(), x: lockedPoint.x, y: lockedPoint.y }
                                    : { id: uuidv4(), x: pos.x, y: pos.y }
                            );
                        }
                    }
                }}

                onMouseUp={(e) => {
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
                        setCurrentPoints((prev) => [...prev, previewPoint]);
                        pushToHistory();
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
                    {/* Grid */}
                    {[...Array(100)].map((_, i) => (
                        <Rect key={`v-${i}`} x={i * 100} y={0} width={1} height={10000} fill="#ddd" />
                    ))}
                    {[...Array(100)].map((_, i) => (
                        <Rect key={`h-${i}`} x={0} y={i * 100} width={10000} height={1} fill="#ddd" />
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
                            stroke={LINE_COLOR}
                            dash={[10, 5]}
                            strokeWidth={2}
                        />
                    )}

                    {/* Live preview while dragging */}
                    {/* Live preview while dragging */}
                    {drawing && currentPoints.length > 0 && previewPoint && (
                        <Shape
                            listening={false}
                            sceneFunc={(ctx, shape) => {
                                const lastPoint = currentPoints[currentPoints.length - 1];
                                const p1 = previewPoint;
                                ctx.beginPath();
                                ctx.moveTo(lastPoint.x, lastPoint.y);
                                ctx.bezierCurveTo(
                                    lastPoint.handleRight?.x ?? lastPoint.x,
                                    lastPoint.handleRight?.y ?? lastPoint.y,
                                    p1.handleLeft?.x ?? p1.x,
                                    p1.handleLeft?.y ?? p1.y,
                                    p1.x,
                                    p1.y
                                );
                                ctx.strokeShape(shape);
                            }}
                            stroke={PREVIEW_LINE_COLOR}
                            strokeWidth={2}
                            dash={[4, 3]}
                        />
                    )}

                    {drawing && currentPoints.length > 0 && mousePos && !previewPoint && !draggingAnchorId && !draggingHandle && (
                        <Shape
                            listening={false}
                            sceneFunc={(ctx, shape) => {
                                const lastPoint = currentPoints[currentPoints.length - 1];
                                const lastHandle = lastPoint.handleRight ?? {
                                    x: lastPoint.x + 100,
                                    y: lastPoint.y,
                                };
                                const dx = lastHandle.x - lastPoint.x;
                                const dy = lastHandle.y - lastPoint.y;
                                const handleStart = {
                                    x: lastPoint.x + dx,
                                    y: lastPoint.y + dy,
                                };
                                const backDx = lastPoint.x - mousePos.x;
                                const backDy = lastPoint.y - mousePos.y;
                                const backLen = Math.sqrt(backDx * backDx + backDy * backDy);
                                const scale = 0.3;
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
                            stroke={PREVIEW_LINE_COLOR}
                            strokeWidth={2}
                            dash={[4, 3]}
                        />
                    )}

                    {/* Render handles & points */}
                    {[...currentPoints, ...paths.flatMap((p) => p.points), ...(previewPoint ? [previewPoint] : [])].map((point, idx) => (
                        <Fragment key={`${point.id}-${idx}`}>
                            {/* Anchor point outline */}
                            <Circle
                                x={point.x}
                                y={point.y}
                                radius={6}
                                stroke={selectedPointId === point.id ? POINT_OUTLINE_COLOR : "transparent"}
                                strokeWidth={selectedPointId === point.id ? 1 : 0}
                            />
                            {/* Interactive anchor (main point) */}
                            <Circle
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
                            {/* Render handles only when this point is selected */}
                            {point.id === selectedPointId && (
                                <>
                                    {point.handleLeft && (point.id === selectedPointId || point === previewPoint) && (
                                        <>
                                            <Line
                                                points={[point.x, point.y, point.handleLeft.x, point.handleLeft.y]}
                                                stroke={HANDLE_COLOR}
                                            />
                                            <Circle
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
                                                    const altKey = e.evt.altKey;
                                                    setCurrentPoints((prev) =>
                                                        prev.map((p) => {
                                                            if (p.id !== point.id) return p;
                                                            const newHandleRight = { x: pos.x, y: pos.y };
                                                            if (altKey || !p.handleLeft) {
                                                                return { ...p, handleRight: newHandleRight };
                                                            }
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
                                    {point.handleRight && (point.id === selectedPointId || point === previewPoint) && (
                                        <>
                                            <Line
                                                points={[point.x, point.y, point.handleRight.x, point.handleRight.y]}
                                                stroke={HANDLE_COLOR}
                                            />
                                            <Circle
                                                x={point.handleRight.x}
                                                y={point.handleRight.y}
                                                radius={3}
                                                fill={HANDLE_COLOR}
                                                draggable={mode === "SELECT"}
                                                onDragStart={() => {
                                                    pushToHistory();
                                                    setDraggingHandle({ pointId: point.id, handle: "right" });
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
        </>
    );
}