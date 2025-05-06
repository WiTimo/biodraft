import { Circle } from 'react-konva';
import { useCanvasState } from './CanvasState';

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
  const selectedPointIds = useCanvasState((s) => s.selectedPointIds);
  const isSelected = id === selectedPointId || selectedPointIds.includes(id);

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
        const selectedIds = useCanvasState.getState().selectedPointIds;
        const dx = e.target.x() - x;
        const dy = e.target.y() - y;
      
        const idsToMove = selectedIds.includes(id) ? selectedIds : [id];
      
        idsToMove.forEach(pid => {
          const pt = useCanvasState.getState().present.paths.flatMap(p => p.points).find(p => p.id === pid);
          if (pt) {
            movePoint(pid, pt.x + dx, pt.y + dy);
          }
        });
      }}
      
      onClick={(e) => {
        if (e.evt.ctrlKey) {
          toggleHandlesForPoint(id);
        } else {
          useCanvasState.getState().clearSelectedPointIds();
          selectPoint(id);
          e.cancelBubble = true;
        }
      }}
    
    />
  );
}
