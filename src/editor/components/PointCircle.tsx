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

const SCREEN_BASE_RADIUS = 6; // screen pixels
const SCREEN_MIN_RADIUS = 2; // screen px min
const SCREEN_MAX_RADIUS = 10; // screen px max


export const PointCircle = React.memo(function PointCircle({ x, y, id, isOverlapping }: PointCircleProps) {
  const { movePoint, selectPoint, selectedPointId, selectedPointIds, currentTool, isSpacePressed, isPanning } = useCanvasState();

  const isSelected = id === selectedPointId || selectedPointIds.includes(id);

  const shapeRef = useRef<any>(null);
  const zoom = useCanvasState((s) => s.zoom);

  // Keep point visuals constant in screen pixels by computing world radius from screen px
  const screenRadius = Math.min(SCREEN_MAX_RADIUS, Math.max(SCREEN_MIN_RADIUS, SCREEN_BASE_RADIUS));
  const worldRadius = screenRadius / zoom;
  const screenStroke = isOverlapping ? 2 : 1;


  return (
    <Circle
      id={id}
      radius={worldRadius}
      ref={shapeRef}
      x={x}
      y={y}
      fill={isOverlapping ? '#9C27B0' : isSelected ? '#00C853' : '#FF5722'}
      stroke={isOverlapping ? '#7B1FA2' : 'black'}
      strokeWidth={screenStroke / zoom}
      hitStrokeWidth={12 / zoom}
      draggable={(currentTool === 'pen' || currentTool === 'select') && !isSpacePressed && !isPanning}
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

        // If space/panning is active, ignore point clicks
        if (state.isSpacePressed || state.isPanning) return;

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
