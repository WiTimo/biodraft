// src/components/Editor.tsx
import React, { useState, Fragment, useEffect } from 'react';
import { Stage, Layer, Shape, Rect, Circle, Line } from 'react-konva';
import Konva from 'konva';
import { v4 as uuidv4 } from 'uuid';
import Toolbar from './Toolbar';
import useEditorState from '../hooks/useEditorState';
import useImage from 'use-image';
import { Image as KonvaImage } from 'react-konva';
import {
  HANDLE_COLOR,
  LINE_COLOR,
  POINT_COLOR,
  POINT_OUTLINE_COLOR,
  PREVIEW_LINE_COLOR,
} from '../lib/colors';

type HandleType = { x: number; y: number };
type BezierPoint = {
  id: string;
  x: number;
  y: number;
  handleLeft?: HandleType;
  handleRight?: HandleType;
};
type Path = {
  id: string;
  points: BezierPoint[];
  closed: boolean;
};

export default function Editor() {
  const { stageScale, setStageScale, stagePosition, setStagePosition, handleWheel, stageRef } = useEditorState();
  const [backgroundImage, status] = useImage('/test.png');
  const [imageScale, setImageScale] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [paths, setPaths] = useState<Path[]>([]);
  const [currentPoints, setCurrentPoints] = useState<BezierPoint[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [previewPoint, setPreviewPoint] = useState<BezierPoint | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [draggingAnchorId, setDraggingAnchorId] = useState<string | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<{ pointId: string; handle: "left" | "right" } | null>(null);
  const [mode, setMode] = useState<"DRAW" | "SELECT">("DRAW");

  // Set background image scale and offset on load
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

  const pushToHistory = () => {
    // A complete implementation for undo history would go here.
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

  const handleMouseDown = (e: any) => {
    if (e.evt.button === 2) return; // Skip right-click
    if (e.evt.ctrlKey || e.evt.metaKey) {
      // Panning code could be added here.
      return;
    }
    const pointer = stageRef.current.getPointerPosition();
    const clickedPoint = {
      x: (pointer.x - stagePosition.x) / stageScale,
      y: (pointer.y - stagePosition.y) / stageScale,
    };

    if (mode === "SELECT") {
      if (e.target && e.target.getClassName() === "Circle") {
        const clickedId = e.target.attrs.id;
        setSelectedPointId(clickedId);
      } else {
        setSelectedPointId(null);
      }
      return; // Only select points in SELECT mode.
    }

    if (mode === "DRAW") {
      const existingPoint = [...currentPoints, ...paths.flatMap((p) => p.points)].find(
        (p) => Math.hypot(p.x - clickedPoint.x, p.y - clickedPoint.y) < 10
      );

      const newPoint: BezierPoint = existingPoint
        ? existingPoint
        : { id: uuidv4(), x: clickedPoint.x, y: clickedPoint.y };

      setPreviewPoint(newPoint);
      setSelectedPointId(newPoint.id);

      if (!drawing) {
        setCurrentPoints([newPoint]);
        setDrawing(true);
      }
    }
  };

  const handleMouseMove = (e: any) => {
    const pointer = stageRef.current.getPointerPosition();
    const pos = {
      x: (pointer.x - stagePosition.x) / stageScale,
      y: (pointer.y - stagePosition.y) / stageScale,
    };
    setMousePos(pos);
    if (previewPoint) {
      const dx = pos.x - previewPoint.x;
      const dy = pos.y - previewPoint.y;
      const handleRight = { x: previewPoint.x + dx, y: previewPoint.y + dy };
      const handleLeft = { x: previewPoint.x - dx, y: previewPoint.y - dy };
      setPreviewPoint({ ...previewPoint, handleLeft, handleRight });
    }
  };

  const handleMouseUp = (e: any) => {
    if (previewPoint && drawing) {
      pushToHistory();
      setCurrentPoints((prev) => [...prev, previewPoint]);
      setSelectedPointId(previewPoint.id);
    }
    setPreviewPoint(null);
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

  return (
    <div>
      <Toolbar mode={mode} setMode={setMode} exportPathsToJson={exportPathsToJson} />
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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
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
          {/* Render saved paths */}
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
                    p0.handleRight?.x || p0.x,
                    p0.handleRight?.y || p0.y,
                    p1.handleLeft?.x || p1.x,
                    p1.handleLeft?.y || p1.y,
                    p1.x,
                    p1.y
                  );
                }
                if (path.closed) {
                  const last = points[points.length - 1];
                  const first = points[0];
                  ctx.bezierCurveTo(
                    last.handleRight?.x || last.x,
                    last.handleRight?.y || last.y,
                    first.handleLeft?.x || first.x,
                    first.handleLeft?.y || first.y,
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
          {/* Render in-progress path */}
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
                    p0.handleRight?.x || p0.x,
                    p0.handleRight?.y || p0.y,
                    p1.handleLeft?.x || p1.x,
                    p1.handleLeft?.y || p1.y,
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
          {/* Render preview segment */}
          {drawing && currentPoints.length > 0 && previewPoint && (
            <Shape
              sceneFunc={(ctx, shape) => {
                const p0 = currentPoints[currentPoints.length - 1];
                const p1 = previewPoint;
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.bezierCurveTo(
                  p0.handleRight?.x || p0.x,
                  p0.handleRight?.y || p0.y,
                  p1.handleLeft?.x || p1.x,
                  p1.handleLeft?.y || p1.y,
                  p1.x,
                  p1.y
                );
                ctx.strokeShape(shape);
              }}
              stroke={LINE_COLOR}
              dash={[10, 4]}
              strokeWidth={2}
            />
          )}
          {/* Render interactive points and handles */}
          {[...currentPoints, ...paths.flatMap(p => p.points), ...(previewPoint ? [previewPoint] : [])].map((point, idx) => (
            <Fragment key={`${point.id}-${idx}`}>
              {/* Anchor outline */}
              <Circle
                x={point.x}
                y={point.y}
                radius={6}
                stroke={selectedPointId === point.id ? POINT_OUTLINE_COLOR : "transparent"}
                strokeWidth={selectedPointId === point.id ? 1 : 0}
              />
              {/* Interactive anchor */}
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
                  setCurrentPoints(prev =>
                    prev.map(p =>
                      p.id === point.id
                        ? {
                          ...p,
                          x: pos.x,
                          y: pos.y,
                          handleLeft: p.handleLeft
                            ? { x: pos.x + (p.handleLeft.x - p.x), y: pos.y + (p.handleLeft.y - p.y) }
                            : undefined,
                          handleRight: p.handleRight
                            ? { x: pos.x + (p.handleRight.x - p.x), y: pos.y + (p.handleRight.y - p.y) }
                            : undefined,
                        }
                        : p
                    )
                  );
                }}
              />
              {/* Render left handle (if available) */}
              {point.id === selectedPointId && point.handleLeft && (
                <>
                  <Line
                    points={[point.x, point.y, point.handleLeft.x, point.handleLeft.y]}
                    stroke={HANDLE_COLOR}
                  />
                  <Circle
                    x={point.handleLeft.x}
                    y={point.handleLeft.y}
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
                      setCurrentPoints(prev =>
                        prev.map(p =>
                          p.id === point.id
                            ? { ...p, handleLeft: { x: pos.x, y: pos.y } }
                            : p
                        )
                      );
                    }}
                  />
                </>
              )}
              {/* Render right handle (if available) */}
              {point.id === selectedPointId && point.handleRight && (
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
                      setCurrentPoints(prev =>
                        prev.map(p => {
                          if (p.id !== point.id) return p;
                          const newHandleRight = { x: pos.x, y: pos.y };
                          const dx = newHandleRight.x - p.x;
                          const dy = newHandleRight.y - p.y;
                          return { ...p, handleRight: newHandleRight, handleLeft: { x: p.x - dx, y: p.y - dy } };
                        })
                      );
                    }}
                  />
                </>
              )}
            </Fragment>
          ))}
        </Layer>
      </Stage>
    </div>
  );
}