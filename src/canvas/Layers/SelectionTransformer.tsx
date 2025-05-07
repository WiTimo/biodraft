// src/canvas/Layers/SelectionTransformer.tsx
import { Group, Transformer, Circle, Rect } from 'react-konva';
import React, { useRef, useEffect, useState } from 'react';
import { useCanvasState } from '../state/CanvasState';

function sampleCubicBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
) {
  return {
    x:
      (1 - t) ** 3 * p0.x +
      3 * (1 - t) ** 2 * t * p1.x +
      3 * (1 - t) * t ** 2 * p2.x +
      t ** 3 * p3.x,
    y:
      (1 - t) ** 3 * p0.y +
      3 * (1 - t) ** 2 * t * p1.y +
      3 * (1 - t) * t ** 2 * p2.y +
      t ** 3 * p3.y,
  };
}

export function SelectionTransformer() {
  const selectedIds = useCanvasState((s) => s.selectedPointIds);
  const paths = useCanvasState((s) => s.present.paths);
  const movePoint = useCanvasState((s) => s.movePoint);
  const moveHandle = useCanvasState((s) => s.moveHandle);
  const saveState = useCanvasState((s) => s.saveState);

  const groupRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // Snapshot before-transform data
  const beforeRef = useRef<
    {
      id: string;
      x: number;
      y: number;
      handleIn: { dx: number; dy: number };
      handleOut: { dx: number; dy: number };
    }[]
  >([]);

  // Fixed pivot point (in absolute coords), captured once on transform start
  const pivotRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Gather selected points & fully selected paths
  const selectedPoints = paths
    .flatMap((p) => p.points)
    .filter((pt) => selectedIds.includes(pt.id));
  const selectedPaths = paths.filter((path) =>
    path.points.every((pt) => selectedIds.includes(pt.id))
  );

  // Sample each cubic segment to get tight bounding box
  const sampledPoints: { x: number; y: number }[] = [];
  selectedPaths.forEach((path) => {
    for (let i = 0; i < path.points.length - 1; i++) {
      const p1 = path.points[i];
      const p2 = path.points[i + 1];
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

  if (sampledPoints.length === 0) {
    return <Group />;
  }

  // Compute axis-aligned bounding box
  const xs = sampledPoints.map((p) => p.x);
  const ys = sampledPoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;

  // Attach Transformer to our group whenever the selection changes
  useEffect(() => {
    if (groupRef.current && trRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [sampledPoints]);

  // --- Drag handlers (translate) ---
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

  // --- Transform start: snapshot before-state & pivot ---
  const onTransformStart = () => {
    // record original coords & handles
    beforeRef.current = selectedPoints.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      handleIn: { ...p.handleIn },
      handleOut: { ...p.handleOut },
    }));
    // compute pivot once from the unrotated bounding box
    const box = groupRef.current.getClientRect({
      relativeTo: groupRef.current.getLayer(),
    });
    pivotRef.current = {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
    saveState();
  };

  // --- Frame-by-frame during transform: live apply rotation+scale ---
  const onTransformFrame = () => {
    const group = groupRef.current;
    const rotationDeg = group.rotation();
    const scaleX = group.scaleX();
    const scaleY = group.scaleY();
    const pivot = pivotRef.current;

    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    function transformVec(vx: number, vy: number) {
      return {
        x: (vx * cos - vy * sin) * scaleX,
        y: (vx * sin + vy * cos) * scaleY,
      };
    }

    beforeRef.current.forEach((orig) => {
      // 1) rotate+scale point position
      const localX = orig.x - pivot.x;
      const localY = orig.y - pivot.y;
      const pt = transformVec(localX, localY);
      movePoint(orig.id, pivot.x + pt.x, pivot.y + pt.y);

      // 2) rotate+scale handles (altPressed=true to avoid auto-mirror)
      const inT = transformVec(orig.handleIn.dx, orig.handleIn.dy);
      const outT = transformVec(orig.handleOut.dx, orig.handleOut.dy);
      moveHandle(orig.id, 'handleIn', inT.x, inT.y, false, true);
      moveHandle(orig.id, 'handleOut', outT.x, outT.y, false, true);
    });
  };

  // --- Transform end: final update + reset the Konva transform ---
  const onTransformEnd = () => {
    onTransformFrame();
    const group = groupRef.current;
    group.rotation(0);
    group.scaleX(1);
    group.scaleY(1);
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
        onTransformStart={onTransformStart}
        onTransform={onTransformFrame}
        onTransformEnd={onTransformEnd}
        onMouseDown={(e) => (e.cancelBubble = true)}
      >
        {/* transparent rect catches interactions */}
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="rgba(0,0,0,0.001)"
          listening
        />
        {/* invisible control points for Transformer bounds */}
        {sampledPoints.map((pt, i) => (
          <Circle
            key={i}
            x={pt.x - minX}
            y={pt.y - minY}
            radius={0.001}
            listening={false}
          />
        ))}
      </Group>
      <Transformer
        ref={trRef}
        rotateEnabled
        keepRatio={false}
        rotationSnaps={[0, 15, 30, 45, 90, 135, 180, 225, 270, 315]}
      />
    </>
  );
}
