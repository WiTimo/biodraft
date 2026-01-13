import type { Handle, Point } from '../state/types';
import { evaluateBezier } from '../state/utils';
import { formatNumber } from './unitUtils';

// In this editor, world units are centimeters.
const MM_PER_CM = 10;
const CM_PER_IN = 2.54;

export type DisplayUnits =
  | { system: 'metric'; metricUnit: 'cm' | 'mm' }
  | { system: 'imperial' };

export function formatWorldLengthCm(lengthCm: number, units: DisplayUnits): string {
  if (!Number.isFinite(lengthCm)) return '';

  if (units.system === 'metric') {
    if (units.metricUnit === 'mm') {
      const mm = lengthCm * MM_PER_CM;
      return `${formatNumber(mm, 0)} mm`;
    }
    return `${formatNumber(lengthCm, 2)} cm`;
  }

  const inches = lengthCm / CM_PER_IN;
  return `${formatNumber(inches, 2)} in`;
}

export function approximateCubicBezierLengthCm(
  p0: Pick<Point, 'x' | 'y'>,
  h0: Handle,
  h1: Handle,
  p1: Pick<Point, 'x' | 'y'>,
  steps = 30,
): number {
  const n = Math.max(5, Math.floor(steps));
  let length = 0;

  let prev = evaluateBezier(p0, h0, h1, p1, 0);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const cur = evaluateBezier(p0, h0, h1, p1, t);
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    length += Math.sqrt(dx * dx + dy * dy);
    prev = cur;
  }

  return length;
}

export function distanceCm(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function pointOnCubicBezier(
  p0: Pick<Point, 'x' | 'y'>,
  h0: Handle,
  h1: Handle,
  p1: Pick<Point, 'x' | 'y'>,
  t: number,
) {
  return evaluateBezier(p0, h0, h1, p1, t);
}

export function normalAtCubicBezier(
  p0: Pick<Point, 'x' | 'y'>,
  h0: Handle,
  h1: Handle,
  p1: Pick<Point, 'x' | 'y'>,
  t: number,
) {
  // Approximate tangent via finite differences.
  const dt = 1e-3;
  const t0 = Math.max(0, Math.min(1, t - dt));
  const t1 = Math.max(0, Math.min(1, t + dt));
  const a = evaluateBezier(p0, h0, h1, p1, t0);
  const b = evaluateBezier(p0, h0, h1, p1, t1);

  const tx = b.x - a.x;
  const ty = b.y - a.y;
  const mag = Math.sqrt(tx * tx + ty * ty) || 1;

  // Rotate tangent by 90° to get a normal.
  return { nx: -ty / mag, ny: tx / mag };
}
