import { Shape, Line, Circle } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';

export function PenSegmentPreview() {
  const currentPathId = useCanvasState(s => s.currentPathId);
  const paths = useCanvasState(s => s.present.paths);
  const mouse = useCanvasState(s => s.mousePosition);
  const zoom = useCanvasState(s => s.zoom);

  if (!mouse || !currentPathId) return null;

  const path = paths.find(p => p.id === currentPathId);
  if (!path || path.points.length === 0) return null;

  const last = path.points[path.points.length - 1];
  const strokeWidth = Math.min(4, Math.max(0.5, 2 / zoom));

  // 🎯 Vector from mouse to "handle tip" of last point
  const targetX = last.x + last.handleOut.dx;
  const targetY = last.y + last.handleOut.dy;

  const dx = targetX - mouse.x;
  const dy = targetY - mouse.y;

  // 💡 Length limit to prevent too-long handles
  const length = Math.min(Math.sqrt(dx * dx + dy * dy), 80);
  const angle = Math.atan2(dy, dx);

  const handleInX = mouse.x + Math.cos(angle) * length;
  const handleInY = mouse.y + Math.sin(angle) * length;

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
            mouse.x,
            mouse.y
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
        points={[mouse.x, mouse.y, handleInX, handleInY]}
        stroke="gray"
        strokeWidth={1}
        dash={[4, 4]}
        listening={false}
      />
    </>
  );
}
