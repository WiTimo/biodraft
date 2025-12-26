import { Shape, Circle } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';
 

export function PenSegmentPreview() {
  const currentPathId = useCanvasState(s => s.currentPathId);
  const paths = useCanvasState(s => s.present.paths);
  const mouse = useCanvasState(s => s.mousePosition);
  const zoom = useCanvasState(s => s.zoom);
  const snapGuides = useCanvasState(s => s.snapGuides);

  if (!mouse || !currentPathId) return null;

  const path = paths.find(p => p.id === currentPathId);
  if (!path || path.points.length === 0) return null;

  const last = path.points[path.points.length - 1];
  const strokeWidth = Math.min(4, Math.max(0.5, 2 / zoom));

  // Use snapGuides from global state
  const snappedX = snapGuides.x ?? mouse.x;
  const snappedY = snapGuides.y ?? mouse.y;

  // Ghost handle direction
  const targetX = last.x + last.handleOut.dx;
  const targetY = last.y + last.handleOut.dy;
  const dx = targetX - snappedX;
  const dy = targetY - snappedY;
  const length = Math.min(Math.sqrt(dx * dx + dy * dy), 80);
  const angle = Math.atan2(dy, dx);
  const handleInX = snappedX + Math.cos(angle) * length;
  const handleInY = snappedY + Math.sin(angle) * length;

  return (
    <>
      {/* Preview curve */}
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.bezierCurveTo(
            last.x + last.handleOut.dx,
            last.y + last.handleOut.dy,
            handleInX,
            handleInY,
            snappedX,
            snappedY
          );
          ctx.strokeShape(shape);
        }}
        stroke="rgba(0,0,0,0.5)"
        strokeWidth={strokeWidth}
        dash={[2, 2]}
        listening={false}
      />

      {/* Optional visual snap highlight */}
      {(snapGuides.x !== null || snapGuides.y !== null) && (
        <Circle
          x={snappedX}
          y={snappedY}
          radius={6 / zoom}
          stroke="deepskyblue"
          strokeWidth={1.5}
          listening={false}
        />
      )}
    </>
  );
}
