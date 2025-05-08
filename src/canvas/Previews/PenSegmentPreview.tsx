import { Shape, Line, Circle } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';
import { useMemo } from 'react';

const SNAP_DISTANCE = 20;

export function PenSegmentPreview() {
  const currentPathId = useCanvasState(s => s.currentPathId);
  const paths = useCanvasState(s => s.present.paths);
  const mouse = useCanvasState(s => s.mousePosition);
  const zoom = useCanvasState(s => s.zoom);

  const allPoints = useMemo(() => {
    return paths.flatMap(p => p.points);
  }, [paths]);

  if (!mouse || !currentPathId) return null;

  const path = paths.find(p => p.id === currentPathId);
  if (!path || path.points.length === 0) return null;

  const last = path.points[path.points.length - 1];
  const strokeWidth = Math.min(4, Math.max(0.5, 2 / zoom));

  // Snap logic (purely local)
  let snapTarget = null;
  for (const point of allPoints) {
    const dx = point.x - mouse.x;
    const dy = point.y - mouse.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < SNAP_DISTANCE / zoom) {
      snapTarget = point;
      break;
    }
  }

  const drawToX = snapTarget ? snapTarget.x : mouse.x;
  const drawToY = snapTarget ? snapTarget.y : mouse.y;

  // Ghost handle direction
  const targetX = last.x + last.handleOut.dx;
  const targetY = last.y + last.handleOut.dy;
  const dx = targetX - drawToX;
  const dy = targetY - drawToY;
  const length = Math.min(Math.sqrt(dx * dx + dy * dy), 80);
  const angle = Math.atan2(dy, dx);
  const handleInX = drawToX + Math.cos(angle) * length;
  const handleInY = drawToY + Math.sin(angle) * length;

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
            drawToX,
            drawToY
          );
          ctx.strokeShape(shape);
        }}
        stroke="rgba(0,0,0,0.5)"
        strokeWidth={strokeWidth}
        dash={[2, 2]}
        listening={false}
      />

      {/* Optional: ghost handle line */}
      <Line
        points={[drawToX, drawToY, handleInX, handleInY]}
        stroke="gray"
        strokeWidth={1}
        dash={[4, 4]}
        listening={false}
      />

      {/* Snap highlight */}
      {snapTarget && (
        <Circle
          x={snapTarget.x}
          y={snapTarget.y}
          radius={6 / zoom}
          stroke="deepskyblue"
          strokeWidth={1.5}
          listening={false}
        />
      )}
    </>
  );
}
