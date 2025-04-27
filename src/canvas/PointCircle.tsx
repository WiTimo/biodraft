import { Circle } from 'react-konva';
import { useCanvasState } from './canvasState';

interface PointCircleProps {
  x: number;
  y: number;
  id: string;
}

export function PointCircle({ x, y, id }: PointCircleProps) {
  const movePoint = useCanvasState((s) => s.movePoint);
  const toggleHandlesForPoint = useCanvasState((s) => s.toggleHandlesForPoint);


  return (
    <Circle
      x={x}
      y={y}
      radius={5}
      fill="#FF5722"
      stroke="black"
      strokeWidth={1}
      draggable
      name="point"
      onDragMove={(e) => {
        movePoint(id, e.target.x(), e.target.y());
      }}
      onClick={(e) => {
        if (e.evt.ctrlKey) {
          toggleHandlesForPoint(id);
        }
      }}
    />
  );
}
