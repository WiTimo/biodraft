import { Circle } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';
import { useRef } from 'react';
import React from 'react';

interface PointCircleProps {
  x: number;
  y: number;
  id: string;
}

const baseRadius = 6;
const minRadius = 2;
const maxRadius = 10;


export const PointCircle = React.memo(function PointCircle({ x, y, id }: PointCircleProps) {
  const { movePoint, selectPoint, selectedPointId, selectedPointIds, currentTool } = useCanvasState();
  const paths = useCanvasState((s) => s.present.paths);

  const isSelected = id === selectedPointId || selectedPointIds.includes(id);

  const hasOverlappingPoint = React.useMemo(() => {
    // Check if this point appears in multiple paths (shared point)
    let count = 0;
    for (const path of paths) {
      for (const point of path.points) {
        if (point.id === id) {
          count++;
          if (count > 1) {
            return true;
          }
        }
      }
    }
    return false;
  }, [paths, id]);

  const shapeRef = useRef<any>(null);
  const zoom = useCanvasState((s) => s.zoom);


  return (
    <Circle
      id={id}
      radius={Math.min(maxRadius, Math.max(minRadius, baseRadius / zoom))}
      ref={shapeRef}
      x={x}
      y={y}
      fill={hasOverlappingPoint ? '#9C27B0' : isSelected ? '#00C853' : '#FF5722'}
      stroke={hasOverlappingPoint ? '#7B1FA2' : 'black'}
      strokeWidth={hasOverlappingPoint ? 2 : 1}
      draggable={currentTool === 'pen' || currentTool === 'select'}
      name="point"
      perfectDrawEnabled={false}
      onDragStart={() => {
        selectPoint(id);
      }}
      onDragMove={(e) => {
        movePoint(id, e.target.x(), e.target.y());
      }}
      onClick={(e) => {
        const state = useCanvasState.getState();
        const currentTool = state.currentTool;
        if (currentTool !== 'select' && currentTool !== 'pen') return;

        if (e.evt.altKey) {
          // Alt+Click toggles handles
          e.cancelBubble = true;
          state.toggleHandlesForPoint(id);
        } else {
          // Normal click selects the point
          state.clearSelectedPointIds();
          state.selectPoint(id);
          e.cancelBubble = true;
        }
      }}
    />
  );
});
