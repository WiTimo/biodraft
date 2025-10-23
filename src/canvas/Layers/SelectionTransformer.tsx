import { Group, Line, Rect, Circle, Text } from 'react-konva';
import { useMemo, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
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

type HandleSnapshot = { dx: number; dy: number };
type PointSnapshot = {
  id: string;
  x: number;
  y: number;
  handleIn: HandleSnapshot;
  handleOut: HandleSnapshot;
};

export function SelectionTransformer({ isVisible }: { isVisible: boolean }) {
  const selectedIds = useCanvasState((s) => s.selectedPointIds);
  const paths = useCanvasState((s) => s.present.paths);
  const movePoint = useCanvasState((s) => s.movePoint);
  const moveHandle = useCanvasState((s) => s.moveHandle);
  const saveState = useCanvasState((s) => s.saveState);
  

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const lockedAxisRef = useRef<"x" | "y" | null>(null);

  const dragState = useRef<Record<string, unknown> | null>(null);
  const rotateState = useRef<{
    center: { x: number; y: number };
    originalPointerAngle: number;
    originalPoints: PointSnapshot[];
  } | null>(null);

  const selectedPoints = useMemo(
    () => paths.flatMap((p) => p.points).filter((pt) => selectedIds.includes(pt.id)),
    [paths, selectedIds]
  );

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

  const { minX: rawMinX, minY: rawMinY, maxX: rawMaxX, maxY: rawMaxY } = getCenterAndBounds(allBoundingPoints);

  // Ensure the selection bounding box has a minimum screen size so it's always draggable
  const minScreenPx = 12; // minimum size in screen pixels
  const minWorldW = minScreenPx / (useCanvasState.getState().zoom || 1);
  const minWorldH = minScreenPx / (useCanvasState.getState().zoom || 1);

  // Expand bounds if width/height are smaller than the minimum
  let minX = rawMinX;
  let maxX = rawMaxX;
  let minY = rawMinY;
  let maxY = rawMaxY;

  const curW = rawMaxX - rawMinX;
  const curH = rawMaxY - rawMinY;
  if (curW < minWorldW) {
    const extra = (minWorldW - curW) / 2;
    minX = rawMinX - extra;
    maxX = rawMaxX + extra;
  }
  if (curH < minWorldH) {
    const extra = (minWorldH - curH) / 2;
    minY = rawMinY - extra;
    maxY = rawMaxY + extra;
  }

  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const width = maxX - minX;
  const height = maxY - minY;


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

  const selectionSnapshot = useCallback((): PointSnapshot[] => {
    return selectedPoints.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      handleIn: { ...p.handleIn },
      handleOut: { ...p.handleOut },
    }));
  }, [selectedPoints]);

  const applyToSelection = useCallback(
    (modifier: (orig: PointSnapshot) => PointSnapshot) => {
      if (!selectedPoints.length) return;
      const originals = selectionSnapshot();
      if (!originals.length) return;
      saveState();
      originals.forEach((orig: PointSnapshot) => {
        const next = modifier(orig);
        movePoint(orig.id, next.x, next.y);
        moveHandle(orig.id, 'handleIn', next.handleIn.dx, next.handleIn.dy, false, true);
        moveHandle(orig.id, 'handleOut', next.handleOut.dx, next.handleOut.dy, false, true);
      });
    },
    [moveHandle, movePoint, saveState, selectionSnapshot, selectedPoints.length]
  );

  const rotateSelection = useCallback(
    (angleRadians: number) => {
      const cos = Math.cos(angleRadians);
      const sin = Math.sin(angleRadians);
      applyToSelection((orig) => {
        const localX = orig.x - center.x;
        const localY = orig.y - center.y;
        const rotatedX = localX * cos - localY * sin;
        const rotatedY = localX * sin + localY * cos;
        const handleInX = orig.handleIn.dx * cos - orig.handleIn.dy * sin;
        const handleInY = orig.handleIn.dx * sin + orig.handleIn.dy * cos;
        const handleOutX = orig.handleOut.dx * cos - orig.handleOut.dy * sin;
        const handleOutY = orig.handleOut.dx * sin + orig.handleOut.dy * cos;
        return {
          ...orig,
          x: center.x + rotatedX,
          y: center.y + rotatedY,
          handleIn: { dx: handleInX, dy: handleInY },
          handleOut: { dx: handleOutX, dy: handleOutY },
        };
      });
    },
    [applyToSelection, center.x, center.y]
  );

  const flipSelection = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      applyToSelection((orig) => {
        const mirroredX = axis === 'horizontal' ? center.x - (orig.x - center.x) : orig.x;
        const mirroredY = axis === 'vertical' ? center.y - (orig.y - center.y) : orig.y;
        const handleInDx = axis === 'horizontal' ? -orig.handleIn.dx : orig.handleIn.dx;
        const handleOutDx = axis === 'horizontal' ? -orig.handleOut.dx : orig.handleOut.dx;
        const handleInDy = axis === 'vertical' ? -orig.handleIn.dy : orig.handleIn.dy;
        const handleOutDy = axis === 'vertical' ? -orig.handleOut.dy : orig.handleOut.dy;
        return {
          ...orig,
          x: mirroredX,
          y: mirroredY,
          handleIn: { dx: handleInDx, dy: handleInDy },
          handleOut: { dx: handleOutDx, dy: handleOutDy },
        };
      });
    },
    [applyToSelection, center.x, center.y]
  );

  if (!isVisible || selectedPoints.length === 0) return null;

  const toolbarPadding = 6;
  const buttonSize = 28;
  const buttonSpacing = 6;
  // toolbarHeight (screen px) unused - we compute world-space toolbar height below
  type ToolbarIconProps = { x: number; y: number; size: number };
  type ToolbarButton = {
    key: string;
    label: string;
    onClick: () => void;
    icon: (props: ToolbarIconProps) => ReactNode;
  };

  const toolbarButtons: ToolbarButton[] = [
    {
      key: 'rotate-left',
      label: 'Rotate Left',
      onClick: () => rotateSelection(-Math.PI / 2),
  icon: ({ x, y, size }: ToolbarIconProps) => (
        <>
          <Line points={[x + size * 0.8, y, x + size * 0.2, y - size * 0.6, x - size * 0.6, y - size * 0.1]} stroke="#f3f4f6" strokeWidth={1.5} lineCap="round" lineJoin="round" />
          <Line points={[x - size * 0.6, y - size * 0.1, x - size * 0.4, y - size * 0.45]} stroke="#f3f4f6" strokeWidth={1.5} lineCap="round" />
          <Line points={[x - size * 0.6, y - size * 0.1, x - size * 0.15, y - size * 0.1]} stroke="#f3f4f6" strokeWidth={1.5} lineCap="round" />
        </>
      ),
    },
    {
      key: 'rotate-right',
      label: 'Rotate Right',
      onClick: () => rotateSelection(Math.PI / 2),
  icon: ({ x, y, size }: ToolbarIconProps) => (
        <>
          <Line points={[x - size * 0.8, y, x - size * 0.2, y - size * 0.6, x + size * 0.6, y - size * 0.1]} stroke="#f3f4f6" strokeWidth={1.5} lineCap="round" lineJoin="round" />
          <Line points={[x + size * 0.6, y - size * 0.1, x + size * 0.4, y - size * 0.45]} stroke="#f3f4f6" strokeWidth={1.5} lineCap="round" />
          <Line points={[x + size * 0.6, y - size * 0.1, x + size * 0.15, y - size * 0.1]} stroke="#f3f4f6" strokeWidth={1.5} lineCap="round" />
        </>
      ),
    },
    {
      key: 'flip-horizontal',
      label: 'Flip Horizontal',
      onClick: () => flipSelection('horizontal'),
  icon: ({ x, y, size }: ToolbarIconProps) => (
        <>
          <Line points={[x - size * 0.6, y - size * 0.8, x - size * 0.6, y + size * 0.8]} stroke="#f3f4f6" strokeWidth={1.5} />
          <Line points={[x + size * 0.6, y - size * 0.8, x + size * 0.6, y + size * 0.8]} stroke="#f3f4f6" strokeWidth={1.5} />
          <Line points={[x - size * 0.35, y, x + size * 0.35, y]} stroke="#f3f4f6" strokeWidth={1.5} />
          <Line points={[x - size * 0.35, y, x - size * 0.15, y - size * 0.2]} stroke="#f3f4f6" strokeWidth={1.5} />
          <Line points={[x - size * 0.35, y, x - size * 0.15, y + size * 0.2]} stroke="#f3f4f6" strokeWidth={1.5} />
          <Line points={[x + size * 0.35, y, x + size * 0.15, y - size * 0.2]} stroke="#f3f4f6" strokeWidth={1.5} />
          <Line points={[x + size * 0.35, y, x + size * 0.15, y + size * 0.2]} stroke="#f3f4f6" strokeWidth={1.5} />
        </>
      ),
    },
    {
      key: 'flip-vertical',
      label: 'Flip Vertical',
      onClick: () => flipSelection('vertical'),
  icon: ({ x, y, size }: ToolbarIconProps) => (
        <>
          <Line points={[x - size * 0.8, y - size * 0.6, x + size * 0.8, y - size * 0.6]} stroke="#f3f4f6" strokeWidth={1.5} />
          <Line points={[x - size * 0.8, y + size * 0.6, x + size * 0.8, y + size * 0.6]} stroke="#f3f4f6" strokeWidth={1.5} />
          <Line points={[x, y - size * 0.35, x, y + size * 0.35]} stroke="#f3f4f6" strokeWidth={1.5} />
          <Line points={[x, y - size * 0.35, x - size * 0.2, y - size * 0.15]} stroke="#f3f4f6" strokeWidth={1.5} />
          <Line points={[x, y - size * 0.35, x + size * 0.2, y - size * 0.15]} stroke="#f3f4f6" strokeWidth={1.5} />
          <Line points={[x, y + size * 0.35, x - size * 0.2, y + size * 0.15]} stroke="#f3f4f6" strokeWidth={1.5} />
          <Line points={[x, y + size * 0.35, x + size * 0.2, y + size * 0.15]} stroke="#f3f4f6" strokeWidth={1.5} />
        </>
      ),
    },
  ];

  // Keep toolbar a consistent screen size regardless of canvas zoom by converting
  // sizes to world units (divide by zoom). Positions remain world-space so toolbar
  // follows the selection but visual sizes stay constant.
  const buttonSizeWorld = buttonSize / zoom;
  const buttonSpacingWorld = buttonSpacing / zoom;
  const toolbarPaddingWorld = toolbarPadding / zoom;
  const toolbarHeightWorld = buttonSizeWorld + toolbarPaddingWorld * 2;
  const toolbarWidth = toolbarButtons.length * buttonSizeWorld + (toolbarButtons.length - 1) * buttonSpacingWorld + toolbarPaddingWorld * 2;
  const toolbarX = center.x - toolbarWidth / 2;
  const toolbarY = minY - toolbarHeightWorld - 16 / zoom;

  return (
    <>
      <Group x={toolbarX} y={toolbarY} opacity={0.98} listening>
        {toolbarButtons.map((btn, idx) => {
          const btnX = toolbarPaddingWorld + idx * (buttonSizeWorld + buttonSpacingWorld);
          const btnY = toolbarPaddingWorld;
          return (
            <Group
                key={btn.key}
                x={btnX}
                y={btnY}
                listening
                onMouseDown={(e: any) => { e.cancelBubble = true; e.evt?.stopPropagation?.(); btn.onClick(); }}
                onTouchStart={(e: any) => { e.cancelBubble = true; e.evt?.stopPropagation?.(); btn.onClick(); }}
                onMouseEnter={(e) => e.target.getStage()?.container().style.setProperty('cursor', 'pointer')}
                onMouseLeave={(e) => e.target.getStage()?.container().style.setProperty('cursor', 'default')}
              >
              <Rect
                width={Math.max(buttonSizeWorld, 12 / zoom)}
                height={Math.max(buttonSizeWorld, 12 / zoom)}
                cornerRadius={4}
                fill="rgba(255,255,255,0.06)"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={1}
                listening
              />
              {btn.icon({ x: Math.max(buttonSizeWorld, 12 / zoom) / 2, y: Math.max(buttonSizeWorld, 12 / zoom) / 2, size: Math.max(buttonSizeWorld, 12 / zoom) * 0.35 })}
              <Text
                text={btn.label}
                fontSize={10 / zoom}
                fill="#f9fafb"
                y={buttonSizeWorld + 2 / zoom}
                width={buttonSizeWorld}
                align="center"
              />
            </Group>
          );
        })}
      </Group>

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
        onDragStart={(e) => {
          const pointer = e.target.getStage()?.getPointerPosition();
          if (!pointer) return;

          const zoom = useCanvasState.getState().zoom;
          const offset = useCanvasState.getState().offset;

          dragStartRef.current = toWorldPos(pointer, zoom, offset);
          lockedAxisRef.current = null;

          saveState();

          dragState.current = {
            originalPoints: selectedPoints.map((p) => ({
              id: p.id,
              x: p.x,
              y: p.y,
            })),
          };
        }}
        onDragMove={(e) => {
          const pointer = e.target.getStage()?.getPointerPosition();
          if (!pointer || !dragStartRef.current || !dragState.current) return;

          const zoom = useCanvasState.getState().zoom;
          const offset = useCanvasState.getState().offset;
          const worldPointer = toWorldPos(pointer, zoom, offset);

          let dx = worldPointer.x - dragStartRef.current.x;
          let dy = worldPointer.y - dragStartRef.current.y;

          const state = useCanvasState.getState();
          if (state.isShiftPressed) {
            if (!lockedAxisRef.current) {
              lockedAxisRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
            }
            if (lockedAxisRef.current === "x") {
              dy = 0;
            } else {
              dx = 0;
            }
          } else {
            lockedAxisRef.current = null;
          }

          const moveSnapshot = dragState.current as { originalPoints: { id: string; x: number; y: number }[] };
          moveSnapshot.originalPoints.forEach((orig) => {
            movePoint(orig.id, orig.x + dx, orig.y + dy);
          });

          // Visually snap the rect back
          e.target.x(minX);
          e.target.y(minY);
        }}

        onDragEnd={(e) => {
          dragStartRef.current = null;
          dragState.current = null;
          lockedAxisRef.current = null;
          e.target.getStage()?.container().style.setProperty('cursor', 'default')
        }}
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
  name="transform-handle"
  onMouseEnter={(e) =>
    e.target.getStage()?.container().style.setProperty('cursor', 'crosshair')
  }
  onMouseLeave={(e) =>
    e.target.getStage()?.container().style.setProperty('cursor', 'default')
  }
  onMouseDown={(e) => {
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

    const stage = e.target.getStage();
    if (!stage) return;

    const handleMouseMove = (ev: MouseEvent) => {
      const stagePointer = stage.getPointerPosition();
      if (!stagePointer || !rotateState.current) return;

      const wp = toWorldPos(stagePointer, zoom, offset);
      const { center, originalPointerAngle, originalPoints } = rotateState.current;

      const dx = wp.x - center.x;
      const dy = wp.y - center.y;
      let currentAngle = Math.atan2(dy, dx);
      let rotation = currentAngle - originalPointerAngle;

      // Snap to 15°
      if (ev.shiftKey) {
        const deg = (rotation * 180) / Math.PI;
        const snapped = Math.round(deg / 15) * 15;
        rotation = (snapped * Math.PI) / 180;
        currentAngle = originalPointerAngle + rotation;
      }

      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      originalPoints.forEach((orig) => {
        const localX = orig.x - center.x;
        const localY = orig.y - center.y;

        const rotatedX = localX * cos - localY * sin;
        const rotatedY = localX * sin + localY * cos;

        movePoint(orig.id, center.x + rotatedX, center.y + rotatedY);

        const hIn = {
          x: orig.handleIn.dx * cos - orig.handleIn.dy * sin,
          y: orig.handleIn.dx * sin + orig.handleIn.dy * cos,
        };
        const hOut = {
          x: orig.handleOut.dx * cos - orig.handleOut.dy * sin,
          y: orig.handleOut.dx * sin + orig.handleOut.dy * cos,
        };

        moveHandle(orig.id, 'handleIn', hIn.x, hIn.y, false, true);
        moveHandle(orig.id, 'handleOut', hOut.x, hOut.y, false, true);
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      rotateState.current = null;
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
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