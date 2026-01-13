import { Shape, Circle, Label, Line, Tag, Text } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';

import {
  approximateCubicBezierLengthCm,
  formatWorldLengthCm,
  normalAtCubicBezier,
  pointOnCubicBezier,
  type DisplayUnits,
} from '../utils/measurementUtils';
 

export function PenSegmentPreview() {
  const currentPathId = useCanvasState(s => s.currentPathId);
  const paths = useCanvasState(s => s.present.paths);
  const mouse = useCanvasState(s => s.mousePosition);
  const zoom = useCanvasState(s => s.zoom);
  const snapGuides = useCanvasState(s => s.snapGuides);
  const units = useCanvasState((s) => s.units);
  const metricUnit = useCanvasState((s) => s.metricUnit);

  if (!mouse || !currentPathId) return null;

  const path = paths.find(p => p.id === currentPathId);
  if (!path || path.points.length === 0) return null;

  const last = path.points[path.points.length - 1];
  // Keep preview stroke visually constant on screen by dividing by zoom
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

  const displayUnits: DisplayUnits =
    units === 'metric' ? { system: 'metric', metricUnit: metricUnit === 'mm' ? 'mm' : 'cm' } : { system: 'imperial' };

  const handleIn = { dx: handleInX - snappedX, dy: handleInY - snappedY };
  const previewLengthCm = approximateCubicBezierLengthCm(last, last.handleOut, handleIn, { x: snappedX, y: snappedY }, 30);
  const previewLengthLabel = formatWorldLengthCm(previewLengthCm, displayUnits);

  const labelStyle = (() => {
    if (typeof window === 'undefined') {
      return {
        fill: 'rgba(255,255,255,0.92)',
        stroke: 'rgba(0,0,0,0.12)',
        text: 'rgba(0,0,0,0.85)',
      };
    }
    const cs = getComputedStyle(document.documentElement);
    return {
      fill: (cs.getPropertyValue('--panel-opaque') || 'rgba(255,255,255,0.92)').trim(),
      stroke: (cs.getPropertyValue('--border') || 'rgba(0,0,0,0.12)').trim(),
      text: (cs.getPropertyValue('--fg') || 'rgba(0,0,0,0.85)').trim(),
    };
  })();

  const midT = 0.5;
  const mid = pointOnCubicBezier(last, last.handleOut, handleIn, { x: snappedX, y: snappedY }, midT);
  const { nx, ny } = normalAtCubicBezier(last, last.handleOut, handleIn, { x: snappedX, y: snappedY }, midT);
  const offsetDist = 7 / zoom;
  const labelX = mid.x + nx * offsetDist;
  const labelY = mid.y + ny * offsetDist;
  const fontSize = Math.min(7, Math.max(5, 6 / zoom));
  const padding = Math.min(2, Math.max(0.5, 1 / zoom));
  const leaderStrokeWidth = Math.max(0.5, 1 / zoom);

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
        stroke={(typeof window !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--path-stroke') : 'rgba(0,0,0,0.5)') as string}
        strokeWidth={strokeWidth}
        // Keep stroke size stable by dividing by zoom and disabling stroke scaling
        strokeScaleEnabled={false}
        listening={false}
      />

      {/* Live segment length label */}
      {previewLengthLabel && (
        <Label x={labelX} y={labelY} listening={false} opacity={0.55}>
          <Tag
            fill={labelStyle.fill}
            stroke={labelStyle.stroke}
            strokeWidth={Math.max(0.5, 1 / zoom)}
            cornerRadius={Math.max(2, 4 / zoom)}
          />
          <Text
            text={previewLengthLabel}
            fontSize={fontSize}
            padding={padding}
            fill={labelStyle.text}
            fontFamily={'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'}
          />
        </Label>
      )}

      {previewLengthLabel && (
        <Line
          points={[mid.x, mid.y, labelX, labelY]}
          stroke={'rgba(0,0,0,0.25)'}
          strokeWidth={leaderStrokeWidth}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}

      {/* Optional visual snap highlight */}
      {(snapGuides.x !== null || snapGuides.y !== null) && (
        (() => {
          const cs = getComputedStyle(document.documentElement);
          const snapColor = (cs.getPropertyValue('--snap') || 'deepskyblue').trim();
          return (
            <Circle
              x={snappedX}
              y={snappedY}
              radius={6 / zoom}
              stroke={snapColor}
              strokeWidth={1.5 / zoom}
              strokeScaleEnabled={false}
              listening={false}
            />
          );
        })()
      )}
    </>
  );
}
