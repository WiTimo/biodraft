import { Shape } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';
import { evaluateBezier, normalizeSegment, segmentsEqual } from '../state/utils';
import type { Segment } from '../state/types';

function findPoint(paths: any[], id: string) {
  for (const path of paths) {
    const found = path.points.find((p: any) => p.id === id);
    if (found) return found;
  }
  return null;
}

// Generate points for zigzag
// We sample the curve, then create a zigzag path along it
function getZigZagPoints(p0: any, p1: any, zoom: number) {
  // Sample the curve
  const points: {x: number, y: number}[] = [];
  // Approximate length to decide steps
  const straightDist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  // We want zigzags to be roughly consistent in size in world space.
  // Say, one zigzag every 5 units.
  const steps = Math.max(10, Math.ceil(straightDist / 2)); 
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { x, y } = evaluateBezier(p0, p0.handleOut, p1.handleIn, p1, t);
    points.push({x, y});
  }

  return points;
}

export function ElasticLayer() {
  const paths = useCanvasState(s => s.present.paths);
  const elasticEdgesState = useCanvasState(s => s.present.elasticEdges);
  const elasticEdges = elasticEdgesState || [];
  const zoom = useCanvasState(s => s.zoom);
  const currentTool = useCanvasState(s => s.currentTool);

  // Per user request: "marked when the tool is selected and hidden when not"
  if (currentTool !== 'rubber') return null;

  return (
    <>
      {elasticEdges.map((segment, i) => {
        const [id1, id2] = segment;
        const p1 = findPoint(paths, id1);
        const p2 = findPoint(paths, id2);

        if (!p1 || !p2) return null;

        return (
          <Shape
            key={`elastic-${id1}-${id2}`}
            stroke="#ff00ff" // Magenta for rubber/elastic
            strokeWidth={2 / zoom}
            listening={false}
            sceneFunc={(ctx, shape) => {
              const points = getZigZagPoints(p1, p2, zoom);
              if (points.length < 2) return;

              ctx.beginPath();
              
              // Draw zigzag
              // Vector math to offset perpendicular to the tangent
              const zigZagAmplitude = 4 / zoom; 
              
              ctx.moveTo(points[0].x, points[0].y);

              for (let j = 1; j < points.length; j++) {
                const prev = points[j - 1];
                const curr = points[j];
                
                // Direction
                const dx = curr.x - prev.x;
                const dy = curr.y - prev.y;
                const len = Math.hypot(dx, dy);
                if (len < 0.001) continue;
                
                // Normal vector (-dy, dx)
                const nx = -dy / len;
                const ny = dx / len;

                // Alternate offset
                const offset = (j % 2 === 0 ? 1 : -1) * zigZagAmplitude;
                
                ctx.lineTo(curr.x + nx * offset, curr.y + ny * offset);
              }

              ctx.strokeShape(shape);
            }}
          />
        );
      })}
    </>
  );
}
