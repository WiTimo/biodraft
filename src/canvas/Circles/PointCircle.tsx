import { Circle } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';
import { useRef } from 'react';
import React from 'react';

interface PointCircleProps {
  x: number;
  y: number;
  id: string;
}

export const PointCircle = React.memo(function PointCircle({ x, y, id }: PointCircleProps) {
  const { movePoint, toggleHandlesForPoint, selectPoint, selectedPointId, selectedPointIds, currentTool } = useCanvasState();

  const isSelected = id === selectedPointId || selectedPointIds.includes(id);

  const shapeRef = useRef<any>(null);

  return (
    <Circle
      ref={shapeRef}
      x={x}
      y={y}
      radius={6}
      fill={isSelected ? '#00C853' : '#FF5722'}
      stroke="black"
      strokeWidth={1}
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
        const currentTool = useCanvasState.getState().currentTool;
        if (currentTool !== 'select' && currentTool !== 'pen') return;

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
});
