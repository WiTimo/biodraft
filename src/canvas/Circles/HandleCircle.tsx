import { Circle, Line } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    setPos({ x: pointX + dx, y: pointY + dy });
  }, [pointX, pointY, dx, dy]);

  if (!isVisible) return null;

  return (
    <>
      <Line
        points={[pointX, pointY, pos.x, pos.y]}
        stroke="gray"
        strokeWidth={1}
        dash={[4, 4]}
        listening={false}
      />
      <Circle
        x={pos.x}
        y={pos.y}
        radius={4}
        fill="#2196F3"
        draggable={currentTool === 'select' || currentTool === 'pen'}
        name="handle"
        perfectDrawEnabled={false}
        onDragStart={(e) => {
          const currentTool = useCanvasState.getState().currentTool;
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
          moveHandle(pointId, type, dx, dy, false, altPressed); // don't save in real time
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
    </>
  );
});
