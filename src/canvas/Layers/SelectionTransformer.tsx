import { Line, Rect, Circle, Text } from 'react-konva';
import { useMemo, useRef } from 'react';
import { useCanvasState } from '../state/CanvasState';

const cornerCursors = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize'];

function sampleCubicBezier(p0: any, p1: any, p2: any, p3: any, t: any) {
  return {
    x: (1 - t) ** 3 * p0.x + 3 * (1 - t) ** 2 * t * p1.x + 3 * (1 - t) * t ** 2 * p2.x + t ** 3 * p3.x,
    y: (1 - t) ** 3 * p0.y + 3 * (1 - t) ** 2 * t * p1.y + 3 * (1 - t) * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}
function toWorldPos(pointer: any, zoom: any, offset: any) {
  return {
    x: (pointer.x - offset.x) / zoom,
    y: (pointer.y - offset.y) / zoom,
  };
}
function getCenterAndBounds(points: any) {
  const xs = points.map((p: any) => p.x);
  const ys = points.map((p: any) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  return { minX, minY, maxX, maxY, center, width: maxX - minX, height: maxY - minY };
}

export function SelectionTransformer({ isVisible }: { isVisible: boolean }) {
  const selectedIds = useCanvasState((s) => s.selectedPointIds);
  const paths = useCanvasState((s) => s.present.paths);
  const movePoint = useCanvasState((s) => s.movePoint);
  const moveHandle = useCanvasState((s) => s.moveHandle);
  const saveState = useCanvasState((s) => s.saveState);

  const dragState = useRef(null);
  const rotateState = useRef(null);

  const selectedPoints = useMemo(
    () => paths.flatMap((p) => p.points).filter((pt) => selectedIds.includes(pt.id)),
    [paths, selectedIds]
  );

  const sampledPoints = useMemo(() => {
    const points: any = [];

    paths.forEach((path) => {
      const pts = path.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];

        if (selectedIds.includes(p1.id) && selectedIds.includes(p2.id)) {
          for (let t = 0; t <= 1.0; t += 0.1) {
            points.push(
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
      }
    });

    // Include all selected individual points if no adjacent pair was found
    if (points.length === 0) {
      return paths.flatMap((p) => p.points.filter(pt => selectedIds.includes(pt.id)));
    }

    return points;
  }, [paths, selectedIds]);

  const allBoundingPoints = [...selectedPoints];

  paths.forEach((path) => {
    const pts = path.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];

      if (selectedIds.includes(p1.id) && selectedIds.includes(p2.id)) {
        for (let t = 0; t <= 1.0; t += 0.05) {
          //@ts-ignore
          allBoundingPoints.push(sampleCubicBezier(
            { x: p1.x, y: p1.y },
            { x: p1.x + p1.handleOut.dx, y: p1.y + p1.handleOut.dy },
            { x: p2.x + p2.handleIn.dx, y: p2.y + p2.handleIn.dy },
            { x: p2.x, y: p2.y },
            t
          ));
        }
      }
    }
  });

  const { minX, minY, maxX, maxY, center, width, height } = getCenterAndBounds(allBoundingPoints);


  const cornerPoints = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  const zoom = useCanvasState((s) => s.zoom);
  const offset = useCanvasState((s) => s.offset);
  const handleRadius = Math.min(10, Math.max(4, 8 / zoom));

  const onHandleDragStart = (_: any, cornerIndex: number) => {
    const corner = cornerPoints[cornerIndex];
    const centerVec = { x: corner.x - center.x, y: corner.y - center.y };
    const selectedPoints = paths
      .flatMap((p) => p.points)
      .filter((pt) => selectedIds.includes(pt.id));
    //@ts-ignore
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

  const onHandleDragMove = (e: any, _cornerIndex: any) => {
    if (!dragState.current) return;

    const zoom = useCanvasState.getState().zoom;
    const offset = useCanvasState.getState().offset;

    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;

    const worldPointer = toWorldPos(pointer, zoom, offset);
    const { center, originalPoints, startDistance } = dragState.current as any;

    const currentVec = { x: worldPointer.x - center.x, y: worldPointer.y - center.y };
    const currentDistance = Math.sqrt(currentVec.x ** 2 + currentVec.y ** 2);
    const scale = currentDistance / startDistance;
    originalPoints.forEach((orig: any) => {
      const localX = orig.x - center.x;
      const localY = orig.y - center.y;

      movePoint(orig.id, center.x + localX * scale, center.y + localY * scale);
      moveHandle(orig.id, 'handleIn', orig.handleIn.dx * scale, orig.handleIn.dy * scale, false, true);
      moveHandle(orig.id, 'handleOut', orig.handleOut.dx * scale, orig.handleOut.dy * scale, false, true);
    });
  };

  const onRotateDragStart = (e: any) => {
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;

    const worldPointer = toWorldPos(pointer, zoom, offset);
    const dx = worldPointer.x - center.x;
    const dy = worldPointer.y - center.y;
    const angle = Math.atan2(dy, dx);

    rotateState.current = {
      center: { ...center },
      originalPointerAngle: angle,
      originalPoints: selectedPoints.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        handleIn: { ...p.handleIn },
        handleOut: { ...p.handleOut },
      })),
    };

    saveState();
  };

  const onRotateDragMove = (e: any) => {
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer || !rotateState.current) return;

    const worldPointer = toWorldPos(pointer, zoom, offset);

    const { center, originalPointerAngle, originalPoints } = rotateState.current;

    const dx = worldPointer.x - center.x;
    const dy = worldPointer.y - center.y;
    const currentPointerAngle = Math.atan2(dy, dx);
    const rotation = currentPointerAngle - originalPointerAngle;

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const rotate = (x: number, y: number) => ({
      x: x * cos - y * sin,
      y: x * sin + y * cos,
    });

    originalPoints.forEach((orig) => {
      const dx = orig.x - center.x;
      const dy = orig.y - center.y;
      const rotated = rotate(dx, dy);
      movePoint(orig.id, center.x + rotated.x, center.y + rotated.y);

      const hIn = rotate(orig.handleIn.dx, orig.handleIn.dy);
      const hOut = rotate(orig.handleOut.dx, orig.handleOut.dy);
      moveHandle(orig.id, 'handleIn', hIn.x, hIn.y, false, true);
      moveHandle(orig.id, 'handleOut', hOut.x, hOut.y, false, true);
    });
  };



  if (!isVisible) return null;
  if (sampledPoints.length === 0) return null;
  if (selectedIds.length === 1) {
    return null;
  }

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
        onMouseEnter={(e) => e.target.getStage()?.container().style.setProperty('cursor', 'move')}
        onMouseLeave={(e) => e.target.getStage()?.container().style.setProperty('cursor', 'default')}
        onDragStart={() => saveState()}
        onDragMove={(e) => {
          const dx = e.target.x() - minX;
          const dy = e.target.y() - minY;
          selectedPoints.forEach((p) => movePoint(p.id, p.x + dx, p.y + dy));
          e.target.x(minX);
          e.target.y(minY);
        }}
        onDragEnd={(e) => e.target.getStage()?.container().style.setProperty('cursor', 'default')}
      />

      <Line
        points={[(minX + maxX) / 2, minY, (minX + maxX) / 2, minY - 40]}
        stroke="gray"
        dash={[4, 4]}
        strokeWidth={1}
      />

      <Circle
        x={(minX + maxX) / 2}
        y={minY - 40}
        radius={handleRadius}
        fill="#9C27B0"
        draggable
        name="transform-handle"
        onMouseEnter={(e) => e.target.getStage()?.container().style.setProperty('cursor', 'crosshair')}
        onMouseLeave={(e) => e.target.getStage()?.container().style.setProperty('cursor', 'default')}
        onDragStart={(e) => {
          e.target.getStage()?.container().style.setProperty('cursor', 'grabbing');
          onRotateDragStart(e);
        }}
        onDragMove={onRotateDragMove}
        onDragEnd={(e) => {
          saveState();
          rotateState.current = null;
          e.target.getStage()?.container().style.setProperty('cursor', 'default');
        }}
      />

      <Line
        points={[...cornerPoints, cornerPoints[0]].flatMap((p) => [p.x, p.y])}
        closed
        stroke="deepskyblue"
        strokeWidth={1.5}
        dash={[4, 4]}
        listening={false}
      />

      {cornerPoints.map((p, idx) => (
        <Circle
          key={`corner-${idx}`}
          x={p.x}
          y={p.y}
          radius={handleRadius}
          fill="#2196F3"
          draggable
          name="transform-handle"
          onMouseEnter={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = cornerCursors[idx];
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = 'default';
          }}
          onDragStart={(e) => {
            e.target.getStage()?.container().style.setProperty('cursor', 'grabbing');
            onHandleDragStart(e, idx);
          }}
          onDragMove={(e) => onHandleDragMove(e, idx)}
          onDragEnd={(e) => {
            saveState();
            dragState.current = null;
            e.target.getStage()?.container().style.setProperty('cursor', 'default');
          }}
        />
      ))}
    </>
  );
}