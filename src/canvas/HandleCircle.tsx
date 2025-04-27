import { Circle, Line } from 'react-konva';
import { useCanvasState } from './canvasState';

interface HandleCircleProps {
  pointX: number;
  pointY: number;
  dx: number;
  dy: number;
  pointId: string;
  type: 'handleIn' | 'handleOut';
}

export function HandleCircle({ pointX, pointY, dx, dy, pointId, type }: HandleCircleProps) {
  const { moveHandle, startHandleMove, endHandleMove } = useCanvasState();

  return (
    <>
      <Line
        points={[pointX, pointY, pointX + dx, pointY + dy]}
        stroke="gray"
        strokeWidth={1}
        dash={[4, 4]}
      />
      <Circle
        x={pointX + dx}
        y={pointY + dy}
        radius={4}
        fill="#2196F3"
        draggable
        name='handle'
        onDragStart={(e) => {
          startHandleMove(pointId);
        }}
        onDragMove={(e) => {
          const newDx = e.target.x() - pointX;
          const newDy = e.target.y() - pointY;
          const altPressed = e.evt.altKey || e.evt.metaKey;
          moveHandle(pointId, type, newDx, newDy, false, altPressed);
        }}
        onDragEnd={(e) => {
          const newDx = e.target.x() - pointX;
          const newDy = e.target.y() - pointY;
          const altPressed = e.evt.altKey || e.evt.metaKey;
          moveHandle(pointId, type, newDx, newDy, false, altPressed);
          endHandleMove(); // Important: reset dragging flag!
        }}
      />
    </>
  );
}
