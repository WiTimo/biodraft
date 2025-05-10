import { Shape } from 'react-konva';

export function LinePath({
  points,
  closed = false,
  onClick,
}: {
  points: any[];
  closed?: boolean;
  onClick?: () => void;
}) {
  if (points.length < 2) return null;

  return (
    <Shape
      sceneFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          ctx.bezierCurveTo(
            p1.x + p1.handleOut.dx,
            p1.y + p1.handleOut.dy,
            p2.x + p2.handleIn.dx,
            p2.y + p2.handleIn.dy,
            p2.x,
            p2.y
          );
        }
        if (closed) {
          const pLast = points[points.length - 1];
          const pFirst = points[0];
          ctx.bezierCurveTo(
            pLast.x + pLast.handleOut.dx,
            pLast.y + pLast.handleOut.dy,
            pFirst.x + pFirst.handleIn.dx,
            pFirst.y + pFirst.handleIn.dy,
            pFirst.x,
            pFirst.y
          );
          ctx.closePath();
        }
        ctx.strokeShape(shape);
      }}
      stroke="black"
      strokeWidth={2}
      onClick={onClick}
      listening={!!onClick}
    />
  );
}
