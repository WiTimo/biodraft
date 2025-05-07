import { Group, Transformer, Circle, Rect } from 'react-konva';
import React, { useRef, useEffect, useState } from 'react';
import { useCanvasState } from '../state/CanvasState';

function sampleCubicBezier(p0, p1, p2, p3, t) {
  return {
    x: (1 - t) ** 3 * p0.x +
      3 * (1 - t) ** 2 * t * p1.x +
      3 * (1 - t) * t ** 2 * p2.x +
      t ** 3 * p3.x,
    y: (1 - t) ** 3 * p0.y +
      3 * (1 - t) ** 2 * t * p1.y +
      3 * (1 - t) * t ** 2 * p2.y +
      t ** 3 * p3.y,
  };
}

export function SelectionTransformer() {
  const selectedIds = useCanvasState((s) => s.selectedPointIds);
  const paths = useCanvasState((s) => s.present.paths);
  const movePoint = useCanvasState((s) => s.movePoint);
  const saveState = useCanvasState((s) => s.saveState);

  const groupRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const selectedPoints = paths.flatMap((p) => p.points).filter((p) => selectedIds.includes(p.id));
  const selectedPaths = paths.filter((path) =>
    path.points.every((p) => selectedIds.includes(p.id))
  );

  // Sample Bezier curves
  const sampledPoints: { x: number; y: number }[] = [];
  selectedPaths.forEach((path) => {
    const pts = path.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      for (let t = 0; t <= 1; t += 0.1) {
        sampledPoints.push(
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

  // Compute bounding box
  const minX = Math.min(...sampledPoints.map(p => p.x));
  const maxX = Math.max(...sampledPoints.map(p => p.x));
  const minY = Math.min(...sampledPoints.map(p => p.y));
  const maxY = Math.max(...sampledPoints.map(p => p.y));
  const width = maxX - minX;
  const height = maxY - minY;

  useEffect(() => {
    if (groupRef.current && trRef.current && sampledPoints.length > 0) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [sampledPoints]);

  if (selectedPoints.length === 0) return <Group />;

  const onDragStart = (e: any) => {
    setDragStart(e.target.getAbsolutePosition());
    saveState();
  };

  const onDragMove = (e: any) => {
    const newPos = e.target.getAbsolutePosition();
    if (!dragStart) return;

    const dx = newPos.x - dragStart.x;
    const dy = newPos.y - dragStart.y;

    selectedPoints.forEach((p) => movePoint(p.id, p.x + dx, p.y + dy));
    setDragStart(newPos);
  };

  const onDragEnd = () => {
    setDragStart(null);
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={minX}
        y={minY}
        draggable
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onMouseDown={(e) => (e.cancelBubble = true)}
      >
        {/* Transparent rect to catch drag events */}
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="rgba(0,0,0,0.001)"
          listening={true}
        />
        {/* Invisible control points for transformer bounds */}
        {sampledPoints.map((pt, i) => (
          <Circle
            key={i}
            x={pt.x - minX}
            y={pt.y - minY}
            radius={0.001}
            fill="transparent"
            listening={false}
          />
        ))}
      </Group>
      <Transformer ref={trRef} rotateEnabled={false} />
    </>
  );
}
