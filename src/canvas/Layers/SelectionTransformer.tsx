import { Group, Line, Rect, Circle } from 'react-konva';
import React, { useMemo, useRef, useState } from 'react';
import { useCanvasState } from '../state/CanvasState';

function sampleCubicBezier(p0, p1, p2, p3, t) {
  return {
    x: (1 - t) ** 3 * p0.x + 3 * (1 - t) ** 2 * t * p1.x + 3 * (1 - t) * t ** 2 * p2.x + t ** 3 * p3.x,
    y: (1 - t) ** 3 * p0.y + 3 * (1 - t) ** 2 * t * p1.y + 3 * (1 - t) * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

function getCenterAndBounds(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  return { minX, minY, maxX, maxY, center, width: maxX - minX, height: maxY - minY };
}

function rotatePoint(p, center, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function SelectionTransformer() {
  const selectedIds = useCanvasState((s) => s.selectedPointIds);
  const paths = useCanvasState((s) => s.present.paths);
  const movePoint = useCanvasState((s) => s.movePoint);
  const moveHandle = useCanvasState((s) => s.moveHandle);
  const saveState = useCanvasState((s) => s.saveState);

  const dragState = useRef<{
    center: { x: number; y: number };
    originalPoints: {
      id: string;
      x: number;
      y: number;
      handleIn: { dx: number; dy: number };
      handleOut: { dx: number; dy: number };
    }[];
    startVec: { x: number; y: number };
    startDistance: number;
    startAngle: number;
  } | null>(null);

  const selectedPoints = useMemo(
    () => paths.flatMap((p) => p.points).filter((pt) => selectedIds.includes(pt.id)),
    [paths, selectedIds]
  );

  const sampledPoints = useMemo(() => {
    const sampled = [];
    const selectedPaths = paths.filter((path) => path.points.every((pt) => selectedIds.includes(pt.id)));
    selectedPaths.forEach((path) => {
      for (let i = 0; i < path.points.length - 1; i++) {
        const p1 = path.points[i];
        const p2 = path.points[i + 1];
        for (let t = 0; t <= 1; t += 0.1) {
          sampled.push(
            sampleCubicBezier(
              { x: p1.x, y: p1.y },
              { x: p1.x + p1.handleOut.dx, y: p1.y + p1.handleOut.dy },
              { x: p2.x + p2.handleIn.dx, y: p2.y + p2.handleIn.dy },
              { x: p2.x, y: p2.y },
              t
            )
          );
        }
      }
    });
    return sampled;
  }, [paths, selectedIds]);

  if (sampledPoints.length === 0) return null;

  const { minX, minY, maxX, maxY, center, width, height } = getCenterAndBounds(sampledPoints);

  const cornerPoints = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  const midPoints = [
    { x: (minX + maxX) / 2, y: minY },
    { x: maxX, y: (minY + maxY) / 2 },
    { x: (minX + maxX) / 2, y: maxY },
    { x: minX, y: (minY + maxY) / 2 },
  ];

  const handleRadius = 6;


  const onHandleDragStart = (e: Konva.KonvaEventObject<DragEvent>, cornerIndex: number) => {
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;

    const corner = cornerPoints[cornerIndex];
    const centerVec = { x: corner.x - center.x, y: corner.y - center.y };

    dragState.current = {
      center: { ...center },
      originalPoints: selectedPoints.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        handleIn: { ...p.handleIn },
        handleOut: { ...p.handleOut },
      })),
      startVec: centerVec,
      startDistance: Math.sqrt(centerVec.x ** 2 + centerVec.y ** 2),
      startAngle: Math.atan2(centerVec.y, centerVec.x),
    };

    saveState();
  };



  const onHandleDragMove = (e: Konva.KonvaEventObject<DragEvent>, _cornerIndex: number) => {
    if (!dragState.current) return;

    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;

    const {
      center,
      originalPoints,
      startVec,
      startDistance,
      startAngle
    } = dragState.current;

    const currentVec = { x: pointer.x - center.x, y: pointer.y - center.y };
    const currentDistance = Math.sqrt(currentVec.x ** 2 + currentVec.y ** 2);
    const currentAngle = Math.atan2(currentVec.y, currentVec.x);

    const scale = currentDistance / startDistance;
    const rotation = currentAngle - startAngle;

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const rotateAndScale = (x: number, y: number) => {
      return {
        x: scale * (x * cos - y * sin),
        y: scale * (x * sin + y * cos),
      };
    };

    originalPoints.forEach((orig) => {
      const localX = orig.x - center.x;
      const localY = orig.y - center.y;
      const transformed = rotateAndScale(localX, localY);
      movePoint(orig.id, center.x + transformed.x, center.y + transformed.y);

      const hIn = rotateAndScale(orig.handleIn.dx, orig.handleIn.dy);
      const hOut = rotateAndScale(orig.handleOut.dx, orig.handleOut.dy);

      moveHandle(orig.id, 'handleIn', hIn.x, hIn.y, false, true);
      moveHandle(orig.id, 'handleOut', hOut.x, hOut.y, false, true);
    });
  };


  return (
    <>

      <Rect
        x={minX}
        y={minY}
        width={width}
        height={height}
        fill="rgba(0,0,0,0.001)"
        draggable
        name="transform-handle"
        onDragStart={() => {
          saveState();
        }}
        onDragMove={(e) => {
          const dx = e.target.x() - minX;
          const dy = e.target.y() - minY;

          selectedPoints.forEach((p) => {
            movePoint(p.id, p.x + dx, p.y + dy);
          });

          e.target.x(minX);
          e.target.y(minY);
        }}
      />


      {/* Outline box */}
      <Line
        points={[...cornerPoints, cornerPoints[0]].flatMap((p) => [p.x, p.y])}
        closed
        stroke="deepskyblue"
        strokeWidth={1.5}
        dash={[4, 4]}
        listening={false}
      />

      {/* Drag handles */}
      {cornerPoints.map((p, idx) => (
        <Circle
          key={`corner-${idx}`}
          x={p.x}
          y={p.y}
          radius={handleRadius}
          fill="#2196F3"
          draggable
          name="transform-handle"
          onDragStart={(e) => onHandleDragStart(e, idx)}
          onDragMove={(e) => onHandleDragMove(e, idx)}
          onDragEnd={() => {
            saveState();
            dragState.current = null;
          }}
        />
      ))}
    </>
  );
}
