import { useCanvasState } from '../state/CanvasState';
import { useEffect, useState } from 'react';
import { Circle, Line } from 'react-konva';
import React from 'react';

interface HandleCircleProps {
  pointX: number;
  pointY: number;
  dx: number;
  dy: number;
  pointId: string;
  type: 'handleIn' | 'handleOut';
}

export const HandleCircle = React.memo(function HandleCircle({
  pointX,
  pointY,
  dx,
  dy,
  pointId,
  type,
}: HandleCircleProps) {
  const { currentTool, endHandleMove, startHandleMove, selectedPointId, moveHandle } = useCanvasState();
  const isVisible = pointId === selectedPointId;
  const [pos, setPos] = useState({ x: pointX + dx, y: pointY + dy });
  const zoom = useCanvasState((s) => s.zoom);

  // Keep handle dot size constant in screen pixels
  const HANDLE_SCREEN_BASE = 4; // px
  const HANDLE_SCREEN_MIN = 2;
  const HANDLE_SCREEN_MAX = 8;
  const adjustedScreenRadius = Math.min(HANDLE_SCREEN_MAX, Math.max(HANDLE_SCREEN_MIN, HANDLE_SCREEN_BASE));
  const adjustedRadius = adjustedScreenRadius / zoom;
  const adjustedStrokeWidth = Math.min(2, Math.max(0.5, 1 / zoom));

  useEffect(() => {
    setPos({ x: pointX + dx, y: pointY + dy });
  }, [pointX, pointY, dx, dy]);

  if (!isVisible) return null;

  return (
    <>
      <Line
        points={[pointX, pointY, pos.x, pos.y]}
        stroke="gray"
        strokeWidth={adjustedStrokeWidth}
        listening={false}
      />
      <>
  {/* Invisible larger hit area */}
  <Circle
    x={pos.x}
    y={pos.y}
    radius={adjustedRadius * 2.5} // ⬅️ increase size of hit zone (world units)
    fill="transparent"
    stroke="transparent"
    hitStrokeWidth={20 / zoom}
    draggable={currentTool === 'select' || currentTool === 'pen'}
    name="handle"
    onDragStart={(e) => {
      if (currentTool !== 'select' && currentTool !== 'pen') {
        e.cancelBubble = true;
        return;
      }
      startHandleMove(pointId);
    }}
    onDragMove={(e) => {
      const newX = e.target.x();
      const newY = e.target.y();
      setPos({ x: newX, y: newY });

      const dx = newX - pointX;
      const dy = newY - pointY;
      const altPressed = e.evt.altKey || e.evt.metaKey;
      moveHandle(pointId, type, dx, dy, false, altPressed);
    }}
    onDragEnd={(e) => {
      const finalDx = e.target.x() - pointX;
      const finalDy = e.target.y() - pointY;
      const altPressed = e.evt.altKey || e.evt.metaKey;
      useCanvasState.getState().saveState();
      moveHandle(pointId, type, finalDx, finalDy, true, altPressed);
      endHandleMove();
    }}
  />

  {/* Visible handle dot */}
  <Circle
    x={pos.x}
    y={pos.y}
    radius={adjustedRadius}
    fill="#2196F3"
    listening={false}
    perfectDrawEnabled={false}
  />
</>

    </>
  );
});
