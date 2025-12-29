import { useMemo } from 'react';
import { useCanvasState } from '../state/CanvasState';

function getCenter(points: Array<{ x: number; y: number }>) {
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, minX, minY, maxX, maxY };
}

export default function SelectionToolbarOverlay() {
  // Toolbar removed — unused (was rotate/flip tools)
  return null;
}

