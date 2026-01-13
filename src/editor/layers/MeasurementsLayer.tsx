import { useMemo, type ReactElement } from 'react';
import { Circle, Group, Label, Line, Tag, Text } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';
import type { Path } from '../state/types';
import {
  approximateCubicBezierLengthCm,
  distanceCm,
  formatWorldLengthCm,
  normalAtCubicBezier,
  pointOnCubicBezier,
  type DisplayUnits,
} from '../utils/measurementUtils';

function isPathFullySelected(path: Path, selected: Set<string>) {
  return path.points.length > 0 && path.points.every((pt) => selected.has(pt.id));
}

export function MeasurementsLayer() {
  const paths = useCanvasState((s) => s.present.paths);
  const currentTool = useCanvasState((s) => s.currentTool);
  const currentPathId = useCanvasState((s) => s.currentPathId);

  const selectedPointId = useCanvasState((s) => s.selectedPointId);
  const selectedPointIds = useCanvasState((s) => s.selectedPointIds);
  const isDraggingHandle = useCanvasState((s) => s.isDraggingHandle);

  const zoom = useCanvasState((s) => s.zoom);
  const units = useCanvasState((s) => s.units);
  const metricUnit = useCanvasState((s) => s.metricUnit);

  const selectedSet = useMemo(() => {
    const s = new Set<string>(selectedPointIds);
    if (selectedPointId) s.add(selectedPointId);
    return s;
  }, [selectedPointId, selectedPointIds]);

  const displayUnits: DisplayUnits =
    units === 'metric' ? { system: 'metric', metricUnit: metricUnit === 'mm' ? 'mm' : 'cm' } : { system: 'imperial' };

  const labelStyle = useMemo(() => {
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
  }, []);

  const selectedPoint = useMemo(() => {
    if (!selectedPointId) return null;
    for (const p of paths) {
      const found = p.points.find((pt) => pt.id === selectedPointId);
      if (found) return found;
    }
    return null;
  }, [paths, selectedPointId]);

  const handleEditMode = useMemo(() => {
    if (isDraggingHandle) return true;
    if (!selectedPoint) return false;
    const hasAnyHandle =
      selectedPoint.handleIn.dx !== 0 ||
      selectedPoint.handleIn.dy !== 0 ||
      selectedPoint.handleOut.dx !== 0 ||
      selectedPoint.handleOut.dy !== 0;
    return hasAnyHandle;
  }, [isDraggingHandle, selectedPoint]);

  const targetPaths = useMemo(() => {
    const ids = new Set<string>();

    // While drawing: show lengths for the current path's existing segments.
    if (currentTool === 'pen' && currentPathId) ids.add(currentPathId);

    // While selecting: show lengths for fully-selected paths (pattern selection).
    if (currentTool === 'select' && selectedSet.size > 0) {
      for (const p of paths) {
        if (isPathFullySelected(p, selectedSet)) ids.add(p.id);
      }
    }

    return paths.filter((p) => ids.has(p.id));
  }, [currentPathId, currentTool, paths, selectedSet]);

  // Keep label sizes visually stable by scaling with zoom.
  const fontSize = Math.min(7, Math.max(5, 6 / zoom));
  const padding = Math.min(2, Math.max(0.5, 1 / zoom));
  const offsetDist = 7 / zoom;
  const tagOpacity = 0.45;
  const leaderStrokeWidth = Math.max(0.5, 1 / zoom);

  const elements = useMemo(() => {
    const out: ReactElement[] = [];

    const pushed = new Set<string>();

    const pushLabel = (key: string, x: number, y: number, text: string, opacity: number) => {
      if (!text) return;
      if (pushed.has(key)) return;
      pushed.add(key);
      out.push(
        <Label key={key} x={x} y={y} listening={false} opacity={opacity}>
          <Tag
            fill={labelStyle.fill}
            stroke={labelStyle.stroke}
            strokeWidth={Math.max(0.5, 1 / zoom)}
            cornerRadius={Math.max(2, 4 / zoom)}
          />
          <Text
            text={text}
            fontSize={fontSize}
            padding={padding}
            fill={labelStyle.text}
            fontFamily={'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'}
          />
        </Label>,
      );
    };

    for (const path of targetPaths) {
      const pts = path.points;
      if (pts.length < 2) continue;

      const segmentCount = path.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < segmentCount; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];

        const lengthCm = approximateCubicBezierLengthCm(a, a.handleOut, b.handleIn, b, 30);
        const text = formatWorldLengthCm(lengthCm, displayUnits);
        if (!text) continue;

        const midT = 0.5;
        const mid = pointOnCubicBezier(a, a.handleOut, b.handleIn, b, midT);
        const { nx, ny } = normalAtCubicBezier(a, a.handleOut, b.handleIn, b, midT);

        // Alternate sides for adjacent labels to reduce overlap when segments are dense.
        const side = i % 2 === 0 ? 1 : -1;

        const x = mid.x + nx * offsetDist * side;
        const y = mid.y + ny * offsetDist * side;

        const leaderKey = `leader-${path.id}-${a.id}-${b.id}`;
        if (!pushed.has(leaderKey)) {
          pushed.add(leaderKey);
          out.push(
            <Line
              key={leaderKey}
              points={[mid.x, mid.y, x, y]}
              stroke={'rgba(0,0,0,0.25)'}
              strokeWidth={leaderStrokeWidth}
              listening={false}
              perfectDrawEnabled={false}
            />,
          );
          out.push(
            <Circle
              key={`dot-${path.id}-${a.id}-${b.id}`}
              x={mid.x}
              y={mid.y}
              radius={Math.max(0.6, 1.2 / zoom)}
              fill={'rgba(0,0,0,0.25)'}
              listening={false}
              perfectDrawEnabled={false}
            />,
          );
        }

        pushLabel(`len-${path.id}-${a.id}-${b.id}`, x, y, text, tagOpacity);
      }
    }

    // When editing handles, also show chord (straight-line) vs curve lengths for segments adjacent to the selected point.
    if (handleEditMode && selectedPointId) {
      for (const path of paths) {
        const pts = path.points;
        if (pts.length < 2) continue;

        for (let idx = 0; idx < pts.length; idx++) {
          if (pts[idx].id !== selectedPointId) continue;

          const candidates: Array<[number, number]> = [];
          if (idx > 0) candidates.push([idx - 1, idx]);
          else if (path.closed) candidates.push([pts.length - 1, idx]);

          if (idx < pts.length - 1) candidates.push([idx, idx + 1]);
          else if (path.closed) candidates.push([idx, 0]);

          for (const [i0, i1] of candidates) {
            const p0 = pts[i0];
            const p1 = pts[i1];

            const segKey = i0 < i1 ? `${p0.id}-${p1.id}` : `${p1.id}-${p0.id}`;
            const chordKey = `chord-${path.id}-${segKey}`;
            if (!pushed.has(chordKey)) {
              pushed.add(chordKey);

              const chordOpacity = 0.25;
              out.push(
                <Line
                  key={chordKey}
                  points={[p0.x, p0.y, p1.x, p1.y]}
                  stroke={'rgba(0,0,0,0.55)'}
                  opacity={chordOpacity}
                  strokeWidth={leaderStrokeWidth}
                  dash={[6 / zoom, 6 / zoom]}
                  listening={false}
                  perfectDrawEnabled={false}
                />,
              );
            }

            const curveLen = approximateCubicBezierLengthCm(p0, p0.handleOut, p1.handleIn, p1, 40);
            const chordLen = distanceCm(p0, p1);

            const curveText = formatWorldLengthCm(curveLen, displayUnits);
            const chordText = formatWorldLengthCm(chordLen, displayUnits);
            if (!curveText && !chordText) continue;

            // Curve label near curve midpoint
            const midT = 0.5;
            const mid = pointOnCubicBezier(p0, p0.handleOut, p1.handleIn, p1, midT);
            const { nx, ny } = normalAtCubicBezier(p0, p0.handleOut, p1.handleIn, p1, midT);
            const cx = mid.x + nx * (offsetDist * 0.9);
            const cy = mid.y + ny * (offsetDist * 0.9);

            const curveLeaderKey = `curve-leader-${path.id}-${p0.id}-${p1.id}`;
            if (!pushed.has(curveLeaderKey)) {
              pushed.add(curveLeaderKey);
              out.push(
                <Line
                  key={curveLeaderKey}
                  points={[mid.x, mid.y, cx, cy]}
                  stroke={'rgba(0,120,255,0.35)'}
                  strokeWidth={leaderStrokeWidth}
                  listening={false}
                  perfectDrawEnabled={false}
                />,
              );
            }
            pushLabel(`curve-${path.id}-${p0.id}-${p1.id}`, cx, cy, curveText, 0.6);

            // Chord label near chord midpoint, slightly offset the other way so they don't overlap
            const chordMid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const mag = Math.sqrt(dx * dx + dy * dy) || 1;
            const cnx = -dy / mag;
            const cny = dx / mag;
            const sx = chordMid.x - cnx * (offsetDist * 0.9);
            const sy = chordMid.y - cny * (offsetDist * 0.9);

            const chordLeaderKey = `straight-leader-${path.id}-${p0.id}-${p1.id}`;
            if (!pushed.has(chordLeaderKey)) {
              pushed.add(chordLeaderKey);
              out.push(
                <Line
                  key={chordLeaderKey}
                  points={[chordMid.x, chordMid.y, sx, sy]}
                  stroke={'rgba(0,0,0,0.2)'}
                  strokeWidth={leaderStrokeWidth}
                  listening={false}
                  perfectDrawEnabled={false}
                />,
              );
            }
            pushLabel(`straight-${path.id}-${p0.id}-${p1.id}`, sx, sy, chordText, 0.45);
          }
        }
      }
    }

    return out;
  }, [displayUnits, fontSize, handleEditMode, labelStyle.fill, labelStyle.stroke, labelStyle.text, leaderStrokeWidth, offsetDist, padding, paths, selectedPointId, tagOpacity, targetPaths, zoom]);

  if (elements.length === 0) return null;
  return <Group listening={false}>{elements}</Group>;
}
