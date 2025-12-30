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

  // Keep handle visuals consistent with point circles: compute a screen-space
  // radius and convert to world units by dividing by zoom, so they visually
  // match other UI elements' behavior.
  const SCREEN_BASE_RADIUS = 4; // screen pixels
  const SCREEN_MIN_RADIUS = 2;
  const SCREEN_MAX_RADIUS = 8;
  const screenRadius = Math.min(SCREEN_MAX_RADIUS, Math.max(SCREEN_MIN_RADIUS, SCREEN_BASE_RADIUS));
  const worldRadius = screenRadius / zoom; // world units
  const screenStroke = 1; // px
  const worldStrokeWidth = screenStroke / zoom; // world units
  const hitStroke = 12; // px
  const worldHitStroke = hitStroke / zoom; // world units

  useEffect(() => {
    setPos({ x: pointX + dx, y: pointY + dy });
  }, [pointX, pointY, dx, dy]);

  if (!isVisible) return null;

  return (
    <>
      <Line
        points={[pointX, pointY, pos.x, pos.y]}
        stroke="gray"
        strokeWidth={worldStrokeWidth}
        listening={false}
      />
      <>
  {/* Invisible larger hit area */}
  <Circle
    x={pos.x}
    y={pos.y}
    radius={worldRadius * 2.5} // world units
    fill="transparent"
    stroke="transparent"
    hitStrokeWidth={worldHitStroke}
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
    radius={worldRadius}
    fill="#2196F3"
    stroke="black"
    strokeWidth={worldStrokeWidth}
    listening={false}
    perfectDrawEnabled={false}
  />
</>

    </>
  );
});
