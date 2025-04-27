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
    const moveHandle = useCanvasState((s) => s.moveHandle);
    const startHandleMove = useCanvasState((s) => s.startHandleMove);
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
        onDragStart={() => {
            startHandleMove(pointId);
          }}
        onDragMove={(e) => {
            const newDx = e.target.x() - pointX;
            const newDy = e.target.y() - pointY;
            moveHandle(pointId, type, newDx, newDy, false); // no save here
        }}
        onDragEnd={(e) => {
            const newDx = e.target.x() - pointX;
            const newDy = e.target.y() - pointY;
            moveHandle(pointId, type, newDx, newDy, false); // still no save here
        }}
        />

    </>
  );
}
