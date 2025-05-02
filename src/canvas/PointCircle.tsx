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
  const selectPoint = useCanvasState((s) => s.selectPoint);
  const selectedPointId = useCanvasState((s) => s.selectedPointId);

  const isSelected = id === selectedPointId;

  return (
    <Circle
      x={x}
      y={y}
      radius={6}
      fill={isSelected ? '#00C853' : '#FF5722'}
      stroke="black"
      strokeWidth={1}
      draggable
      name="point"
      onDragStart={(e) => {
        selectPoint(id);
      }}
      onDragMove={(e) => {
        movePoint(id, e.target.x(), e.target.y());
      }}
      onClick={(e) => {
        if (e.evt.ctrlKey) {
          toggleHandlesForPoint(id);
        } else {
          selectPoint(id);
          e.cancelBubble = true;
        }
      }}
    
    />
  );
}
