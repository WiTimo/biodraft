import { Shape } from 'react-konva';
import useImage from 'use-image';
import type { PathTexture } from '../state/CanvasState';

export function LinePath({
  points,
  closed = false,
  texture,
  onClick,
}: {
  points: any[];
  closed?: boolean;
  texture?: PathTexture | null;
  onClick?: () => void;
}) {
  if (points.length < 2) return null;

  const [img] = useImage(texture?.src || '', 'anonymous');

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

        // IMPORTANT: if we have any fill (pattern via props), call fillStrokeShape
        // otherwise just stroke.
        if (closed && img) {
          // Konva will handle the pattern fill using the node props below.
          ctx.fillStrokeShape(shape);
        } else {
          ctx.strokeShape(shape);
        }
      }}
      stroke="black"
      strokeWidth={2}
      // Pattern fill props (Konva handles these after sceneFunc via fillStrokeShape)
      fillPatternImage={img || undefined}
      fillPatternRepeat={texture?.repeat ?? 'repeat'}
      fillPatternScaleX={texture?.scaleX ?? 1}
      fillPatternScaleY={texture?.scaleY ?? 1}
      fillPatternOffsetX={texture?.offsetX ?? 0}
      fillPatternOffsetY={texture?.offsetY ?? 0}
      fillPatternRotation={texture?.rotation ?? 0}
      onClick={onClick}
      listening={!!onClick}
    />
  );
}
