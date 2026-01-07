import { Shape } from 'react-konva';
import useImage from 'use-image';
import { useCanvasState } from '../state/CanvasState';
import type { PathTexture } from '../state/types';

export function LinePath({
  id,
  name,
  points,
  closed = false,
  texture,
  onClick,
  onMouseEnter,
  onMouseLeave,
  highlighted = false,
  highlightColor,
}: {
  id?: string;
  name?: string;
  points: any[];
  closed?: boolean;
  texture?: PathTexture | null;
  onClick?: (e?: any) => void;
  onMouseEnter?: (e?: any) => void;
  onMouseLeave?: (e?: any) => void;
  highlighted?: boolean;
  highlightColor?: string;
}) {
  if (points.length < 2) return null;

  const [img] = useImage(texture?.src || '', 'anonymous');
  const zoom = useCanvasState(s => s.zoom);

  const cs = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const defaultPath = (cs?.getPropertyValue('--path-stroke') || 'black').trim();
  const defaultHighlight = (cs?.getPropertyValue('--path-highlight') || 'rgba(0,120,255,0.6)').trim();
  const strokeColor = highlighted ? (highlightColor ?? defaultHighlight) : defaultPath;
  const strokeW = highlighted ? Math.min(4, 3 / zoom) : 2 / zoom;

  return (
    <Shape
      id={id}
      name={name}
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
      stroke={strokeColor}
      strokeWidth={strokeW}
      // Pattern fill props (Konva handles these after sceneFunc via fillStrokeShape)
      fillPatternImage={img || undefined}
      fillPatternRepeat={texture?.repeat ?? 'repeat'}
      fillPatternScaleX={texture?.scaleX ?? 1}
      fillPatternScaleY={texture?.scaleY ?? 1}
      fillPatternOffsetX={texture?.offsetX ?? 0}
      fillPatternOffsetY={texture?.offsetY ?? 0}
      fillPatternRotation={texture?.rotation ?? 0}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      listening={!!(onClick || onMouseEnter || onMouseLeave)}
    />
  );
}
