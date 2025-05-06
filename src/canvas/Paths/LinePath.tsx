import { Shape } from 'react-konva';

interface LinePathProps {
  points: {
    id: string;
    x: number;
    y: number;
    handleIn: { dx: number; dy: number };
    handleOut: { dx: number; dy: number };
  }[];
  closed?: boolean;
}

export function LinePath({ points, closed = false }: LinePathProps) {
  if (points.length < 2) return null;

  return (
    <Shape
      sceneFunc={(context, shape) => {
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);

        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          context.bezierCurveTo(
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
          context.bezierCurveTo(
            pLast.x + pLast.handleOut.dx,
            pLast.y + pLast.handleOut.dy,
            pFirst.x + pFirst.handleIn.dx,
            pFirst.y + pFirst.handleIn.dy,
            pFirst.x,
            pFirst.y
          );
          context.closePath();
        }

        context.strokeShape(shape);
      }}
      stroke="black"
      strokeWidth={2}
    />
  );
}
