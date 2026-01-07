import { Circle, Line } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';

export function CutLayer() {
  const currentTool = useCanvasState((s) => s.currentTool);
  const pick1 = useCanvasState((s) => s.cutPick1);
  const pick2 = useCanvasState((s) => s.cutPick2);
  const zoom = useCanvasState((s) => s.zoom);

  if (currentTool !== 'cut') return null;
  if (!pick1) return null;

  const cs = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const color = (cs?.getPropertyValue('--path-highlight') || 'rgba(0,120,255,0.6)').trim();

  const r = Math.max(3, 6 / zoom);
  const strokeW = Math.max(1, 2 / zoom);

  return (
    <>
      <Circle x={pick1.x} y={pick1.y} radius={r} stroke={color} strokeWidth={strokeW} fill={'rgba(0,0,0,0.001)'} listening={false} />
      {pick2 ? (
        <>
          <Circle x={pick2.x} y={pick2.y} radius={r} stroke={color} strokeWidth={strokeW} fill={'rgba(0,0,0,0.001)'} listening={false} />
          <Line
            points={[pick1.x, pick1.y, pick2.x, pick2.y]}
            stroke={color}
            strokeWidth={strokeW}
            dash={[8 / zoom, 6 / zoom]}
            listening={false}
          />
        </>
      ) : null}
    </>
  );
}
