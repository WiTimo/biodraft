import { Layer, Line } from 'react-konva';
import { useMemo } from 'react';

import { getStep } from '../utils/grid';

const MM_PER_WORLD_UNIT = 10;

export function GridLayer({
  width,
  height,
  zoom,
  offset,
  basePixelGridSize = 30,
}: {
  width: number;
  height: number;
  zoom: number;
  offset: { x: number; y: number };
  basePixelGridSize?: number;
}) {
  const lines = useMemo(() => {
    if (width <= 0 || height <= 0 || zoom <= 0) return [] as Array<{ key: string; points: number[] }>;

    const worldLeft = -offset.x / zoom;
    const worldTop = -offset.y / zoom;
    const worldRight = worldLeft + width / zoom;
    const worldBottom = worldTop + height / zoom;

    const rawWorldStep = basePixelGridSize / zoom;
    const rawMmStep = rawWorldStep * MM_PER_WORLD_UNIT;
    const mmStep = getStep(rawMmStep);
    const worldStep = mmStep / MM_PER_WORLD_UNIT;

    const startX = Math.floor(worldLeft / worldStep) * worldStep;
    const endX = Math.ceil(worldRight / worldStep) * worldStep;
    const startY = Math.floor(worldTop / worldStep) * worldStep;
    const endY = Math.ceil(worldBottom / worldStep) * worldStep;

    const nextLines: Array<{ key: string; points: number[] }> = [];

    for (let x = startX; x <= endX + worldStep * 0.5; x += worldStep) {
      nextLines.push({ key: `v-${x}`, points: [x, worldTop, x, worldBottom] });
    }

    for (let y = startY; y <= endY + worldStep * 0.5; y += worldStep) {
      nextLines.push({ key: `h-${y}`, points: [worldLeft, y, worldRight, y] });
    }

    return nextLines;
  }, [basePixelGridSize, height, offset.x, offset.y, width, zoom]);

  return (
    <Layer listening={false}>
      {lines.map((l) => (
        <Line
          key={l.key}
          points={l.points}
          stroke="#e8e8e8"
          strokeWidth={1 / zoom}
          listening={false}
        />
      ))}
    </Layer>
  );
}
