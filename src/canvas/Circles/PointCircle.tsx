import { Circle } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';
import { useRef } from 'react';
import React from 'react';

interface PointCircleProps {
  x: number;
  y: number;
  id: string;
  isOverlapping: boolean;
}

const baseRadius = 6;
const minRadius = 2;
const maxRadius = 10;


export const PointCircle = React.memo(function PointCircle({ x, y, id, isOverlapping }: PointCircleProps) {
  const { movePoint, selectPoint, selectedPointId, selectedPointIds, currentTool } = useCanvasState();

  const isSelected = id === selectedPointId || selectedPointIds.includes(id);

  const shapeRef = useRef<any>(null);
  const zoom = useCanvasState((s) => s.zoom);


  return (
    <Circle
      id={id}
      radius={Math.min(maxRadius, Math.max(minRadius, baseRadius / zoom))}
      ref={shapeRef}
      x={x}
      y={y}
      fill={isOverlapping ? '#9C27B0' : isSelected ? '#00C853' : '#FF5722'}
      stroke={isOverlapping ? '#7B1FA2' : 'black'}
      strokeWidth={isOverlapping ? 2 : 1}
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
