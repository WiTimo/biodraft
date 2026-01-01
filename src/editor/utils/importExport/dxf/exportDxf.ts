import { useCanvasState } from '../../../state/CanvasState';
import { evaluateBezier } from '../../../state/utils';
import type { Point, Segment, SegmentPortion } from '../../../state/types';
import {
  computeHumanBounds,
  getFrontBackSplitX,
  inferPatternSideFromPath,
} from '../shared';
import i18n from '../../../../i18n';

/**
 * Minimal DXF exporter supporting:
 * - Pattern paths as LINE/SPLINE entities
 * - Seams as LINE entities (with optional SEAM_META comment)
 *
 * Exports absolute canvas coordinates.
 */
export function exportToDxf() {
  const state = useCanvasState.getState();
  const { paths, seams, backgroundImages } = state.present;
  const { manImageCenters } = state;

  const validPaths = paths.filter((p) => p.points.length > 0);
  if (validPaths.length === 0) {
    alert(i18n.t('importExport.noPatternsToExport'));
    return;
  }

  const stateScale = useCanvasState.getState().dxfScale ?? 1;

  const splitX = getFrontBackSplitX({ manImageCenters, backgroundImages });
  const human_bounds = computeHumanBounds(backgroundImages);

  const lines: string[] = [];
  const push = (s: string) => lines.push(s);

  push('0');
  push('SECTION');
  push('2');
  push('ENTITIES');

  if (human_bounds) {
    push('999');
    push(`HUMAN_BOUNDS:${JSON.stringify(human_bounds)}`);
  }

  for (const path of validPaths) {
    const side = inferPatternSideFromPath(path, splitX);
    const layer = `PATTERN_${path.id}_${side}`;

    const pts = path.points;
    if (pts.length === 0) continue;

    // Export each segment: if both points have zero handles write a LINE,
    // otherwise write a SPLINE (degree 3) representing the cubic Bezier.
    const segCount = path.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];

      const ax = a.x * stateScale;
      const ay = a.y * stateScale;
      const bx = b.x * stateScale;
      const by = b.y * stateScale;

      const hasHandle = a.handleOut.dx !== 0 || a.handleOut.dy !== 0 || b.handleIn.dx !== 0 || b.handleIn.dy !== 0;

      if (!hasHandle) {
        // simple LINE entity
        push('0');
        push('LINE');
        push('8');
        push(layer);
        push('10');
        push(String(ax.toFixed(4)));
        push('20');
        push(String(ay.toFixed(4)));
        push('30');
        push('0');
        push('11');
        push(String(bx.toFixed(4)));
        push('21');
        push(String(by.toFixed(4)));
        push('31');
        push('0');
      } else {
        // Export cubic Bezier as a degree-3 SPLINE with 4 control points (p0, p1, p2, p3)
        const p0x = ax,
          p0y = ay;
        const p1x = (a.x + a.handleOut.dx) * stateScale,
          p1y = (a.y + a.handleOut.dy) * stateScale;
        const p2x = (b.x + b.handleIn.dx) * stateScale,
          p2y = (b.y + b.handleIn.dy) * stateScale;
        const p3x = bx,
          p3y = by;

        push('0');
        push('SPLINE');
        push('8');
        push(layer);
        push('71');
        push('3'); // degree 3
        push('70');
        push('0'); // spline flags
        // control points
        push('10');
        push(String(p0x.toFixed(4)));
        push('20');
        push(String(p0y.toFixed(4)));
        push('30');
        push('0');
        push('10');
        push(String(p1x.toFixed(4)));
        push('20');
        push(String(p1y.toFixed(4)));
        push('30');
        push('0');
        push('10');
        push(String(p2x.toFixed(4)));
        push('20');
        push(String(p2y.toFixed(4)));
        push('30');
        push('0');
        push('10');
        push(String(p3x.toFixed(4)));
        push('20');
        push(String(p3y.toFixed(4)));
        push('30');
        push('0');
        // knot vector for a single cubic Bezier as B-spline: [0,0,0,0,1,1,1,1]
        for (const k of [0, 0, 0, 0, 1, 1, 1, 1]) {
          push('40');
          push(String(k));
        }
        // weights (all 1)
        push('41');
        push('1');
        push('41');
        push('1');
        push('41');
        push('1');
        push('41');
        push('1');
      }
    }
  }

  // seams as LINE entities
  // Build maps for quick lookup of point objects (with handles) and coords
  const ptObjMap = new Map<string, Point>();
  for (const p of validPaths) {
    for (const pt of p.points) {
      ptObjMap.set(pt.id, pt);
    }
  }

  // Export seams. For partial seams we emit two LINE entities per seam (start/end)
  // with a comment group 'SEAM_META' so import can reconstruct ranges.
  for (let si = 0; si < seams.length; si++) {
    const seam = seams[si];
    const [a, b] = seam;

    function evalAt(part: any, t: number | null) {
      if (!part) return null;
      if ((part as any).segment) {
        const portion = part as SegmentPortion;
        const [sa, sb] = portion.segment;
        const pA = ptObjMap.get(sa);
        const pB = ptObjMap.get(sb);
        if (!pA || !pB) return null;
        const tt = t === null ? Math.max(0, Math.min(1, (portion.tStart + portion.tEnd) / 2)) : Math.max(0, Math.min(1, t));
        const isStraight = pA.handleOut.dx === 0 && pA.handleOut.dy === 0 && pB.handleIn.dx === 0 && pB.handleIn.dy === 0;
        if (isStraight) return { x: pA.x + (pB.x - pA.x) * tt, y: pA.y + (pB.y - pA.y) * tt };
        return evaluateBezier(pA, pA.handleOut, pB.handleIn, pB, tt);
      } else {
        const [sa, sb] = part as Segment;
        const pA = ptObjMap.get(sa);
        const pB = ptObjMap.get(sb);
        if (!pA || !pB) return null;
        const tt = t === null ? 0.5 : Math.max(0, Math.min(1, t));
        const isStraight = pA.handleOut.dx === 0 && pA.handleOut.dy === 0 && pB.handleIn.dx === 0 && pB.handleIn.dy === 0;
        if (isStraight) return { x: pA.x + (pB.x - pA.x) * tt, y: pA.y + (pB.y - pA.y) * tt };
        return evaluateBezier(pA, pA.handleOut, pB.handleIn, pB, tt);
      }
    }

    const isPortionA = a && (a as any).tStart !== undefined && (a as any).tEnd !== undefined;
    const isPortionB = b && (b as any).tStart !== undefined && (b as any).tEnd !== undefined;

    if (isPortionA && isPortionB) {
      // write start endpoints
      const pa = evalAt(a, (a as any).tStart);
      const pb = evalAt(b, (b as any).tStart);
      if (pa && pb) {
        push('0');
        push('LINE');
        push('999');
        push(`SEAM_META:idx=${si}:part=start`);
        push('8');
        push('SEAMS');
        push('10');
        push(String((pa.x * stateScale).toFixed(4)));
        push('20');
        push(String((pa.y * stateScale).toFixed(4)));
        push('30');
        push('0');
        push('11');
        push(String((pb.x * stateScale).toFixed(4)));
        push('21');
        push(String((pb.y * stateScale).toFixed(4)));
        push('31');
        push('0');
      }
      // write end endpoints
      const pa2 = evalAt(a, (a as any).tEnd);
      const pb2 = evalAt(b, (b as any).tEnd);
      if (pa2 && pb2) {
        push('0');
        push('LINE');
        push('999');
        push(`SEAM_META:idx=${si}:part=end`);
        push('8');
        push('SEAMS');
        push('10');
        push(String((pa2.x * stateScale).toFixed(4)));
        push('20');
        push(String((pa2.y * stateScale).toFixed(4)));
        push('30');
        push('0');
        push('11');
        push(String((pb2.x * stateScale).toFixed(4)));
        push('21');
        push(String((pb2.y * stateScale).toFixed(4)));
        push('31');
        push('0');
      }
    } else {
      // simple export using midpoint representative
      const pa = evalAt(a, null);
      const pb = evalAt(b, null);
      if (!pa || !pb) continue;
      push('0');
      push('LINE');
      push('999');
      push(`SEAM_META:idx=${si}:part=mid`);
      push('8');
      push('SEAMS');
      push('10');
      push(String((pa.x * stateScale).toFixed(4)));
      push('20');
      push(String((pa.y * stateScale).toFixed(4)));
      push('30');
      push('0');
      push('11');
      push(String((pb.x * stateScale).toFixed(4)));
      push('21');
      push(String((pb.y * stateScale).toFixed(4)));
      push('31');
      push('0');
    }
  }

  push('0');
  push('ENDSEC');
  push('0');
  push('EOF');

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'patterns_with_seams.dxf';
  a.click();
  URL.revokeObjectURL(url);
}
