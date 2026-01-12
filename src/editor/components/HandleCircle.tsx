import { useCanvasState } from '../state/CanvasState';
import { useEffect, useState } from 'react';
import { Circle, Line } from 'react-konva';
import React from 'react';
import { getStep } from '../utils/grid';


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
  const zoom = useCanvasState((s) => s.zoom);

  // Keep handle visuals consistent with point circles: compute a screen-space
  // radius and convert to world units by dividing by zoom, so they visually
  // match other UI elements' behavior.
  const SCREEN_BASE_RADIUS = 4; // screen pixels
  const SCREEN_MIN_RADIUS = 2;
  const SCREEN_MAX_RADIUS = 8;
  const screenRadius = Math.min(SCREEN_MAX_RADIUS, Math.max(SCREEN_MIN_RADIUS, SCREEN_BASE_RADIUS));
  const worldRadius = screenRadius / zoom; // world units
  const screenStroke = 1; // px
  const worldStrokeWidth = screenStroke / zoom; // world units
  const hitStroke = 12; // px
  const worldHitStroke = hitStroke / zoom; // world units

  useEffect(() => {
    setPos({ x: pointX + dx, y: pointY + dy });
  }, [pointX, pointY, dx, dy]);

  if (!isVisible) return null;

  return (
    <>
      <Line
        points={[pointX, pointY, pos.x, pos.y]}
        stroke="gray"
        strokeWidth={worldStrokeWidth}
        listening={false}
      />
      <>
  {/* Invisible larger hit area */}
  <Circle
    x={pos.x}
    y={pos.y}
    radius={worldRadius * 2.5} // world units
    fill="transparent"
    stroke="transparent"
    hitStrokeWidth={worldHitStroke}
    draggable={(currentTool === 'select' || currentTool === 'pen') && !useCanvasState.getState().isSpacePressed && !useCanvasState.getState().isPanning}
    name="handle"
    onDragStart={(e) => {
      if (currentTool !== 'select' && currentTool !== 'pen') {
        e.cancelBubble = true;
        return;
      }
      // Prevent handle drag when panning
      if (useCanvasState.getState().isSpacePressed || useCanvasState.getState().isPanning) return;
      startHandleMove(pointId);
    }}
    onDragMove={(e) => {
      const newXraw = e.target.x();
      const newYraw = e.target.y();

      // If ALT is pressed and grid snapping is enabled, snap the handle movement to the visible grid
      const altPressed = e.evt.altKey || e.evt.metaKey;
      const state = useCanvasState.getState();

      let newX = newXraw;
      let newY = newYraw;

      if (altPressed && state.gridEnabled) {
        // Match CanvasStage's snapWorldToVisibleGrid logic
        const MM_PER_WORLD_UNIT = 10;
        const BASE_PIXEL_GRID_SIZE = 30;
        const rawWorldStep = BASE_PIXEL_GRID_SIZE / zoom;
        const rawMmStep = rawWorldStep * MM_PER_WORLD_UNIT;
        const mmStep = getStep(rawMmStep);
        const worldStep = mmStep / MM_PER_WORLD_UNIT;

        newX = Math.round(newXraw / worldStep) * worldStep;
        newY = Math.round(newYraw / worldStep) * worldStep;

        // Update the visible position of the handle while dragging
        setPos({ x: newX, y: newY });

        // Also set snap guides for visual feedback
        state.setSnapGuides({ x: newX, y: newY });
      } else {
        setPos({ x: newX, y: newY });
      }

      const dx = newX - pointX;
      const dy = newY - pointY;

      moveHandle(pointId, type, dx, dy, false, altPressed);
    }}
    onDragEnd={(e) => {
      const rawX = e.target.x();
      const rawY = e.target.y();
      const altPressed = e.evt.altKey || e.evt.metaKey;
      const state = useCanvasState.getState();

      let finalX = rawX;
      let finalY = rawY;

      if (altPressed && state.gridEnabled) {
        const MM_PER_WORLD_UNIT = 10;
        const BASE_PIXEL_GRID_SIZE = 30;
        const rawWorldStep = BASE_PIXEL_GRID_SIZE / zoom;
        const rawMmStep = rawWorldStep * MM_PER_WORLD_UNIT;
        const mmStep = getStep(rawMmStep);
        const worldStep = mmStep / MM_PER_WORLD_UNIT;

        finalX = Math.round(rawX / worldStep) * worldStep;
        finalY = Math.round(rawY / worldStep) * worldStep;
      }

      useCanvasState.getState().saveState();
      const finalDx = finalX - pointX;
      const finalDy = finalY - pointY;
      moveHandle(pointId, type, finalDx, finalDy, true, altPressed);
      endHandleMove();

      // Clear snap guides set during dragging
      if (state.gridEnabled) state.setSnapGuides({ x: null, y: null });
    }}
  />

  {/* Visible handle dot */}
  <Circle
    x={pos.x}
    y={pos.y}
    radius={worldRadius}
    fill="#2196F3"
    stroke="black"
    strokeWidth={worldStrokeWidth}
    listening={false}
    perfectDrawEnabled={false}
  />
</>

    </>
  );
});
