import { Line } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';
import { useMemo } from 'react';

function getLine(p1: any, p2: any) {
  return [p1.x, p1.y, p2.x, p2.y];
}

function findPoint(paths: any[], id: string) {
  for (const path of paths) {
    const found = path.points.find(p => p.id === id);
    if (found) return found;
  }
  return null;
}

export function SeamLayer() {
  const paths = useCanvasState(s => s.present.paths);
  const seams = useCanvasState(s => s.present.seams);
  const currentTool = useCanvasState(s => s.currentTool);
  const seamLines = useMemo(() => {
    return seams.flatMap(([[a1, b1], [a2, b2]], i) => {
      const pA1 = findPoint(paths, a1);
      const pA2 = findPoint(paths, a2);
      const pB1 = findPoint(paths, b1);
      const pB2 = findPoint(paths, b2);
      if (!pA1 || !pA2 || !pB1 || !pB2) return [];

      return [
        <Line
          key={`seam-${i}-1`}
          points={getLine(pA1, pA2)}
          stroke={"orange"}
          strokeWidth={2}
          dash={[10, 5]}
          listening={false}
        />,
        <Line
          key={`seam-${i}-2`}
          points={getLine(pB1, pB2)}
          stroke={"orange"}
          strokeWidth={2}
          dash={[10, 5]}
          listening={false}
        />,
      ];
    }).filter(Boolean);
  }, [paths, seams]);
  if(!currentTool || currentTool !== "seam") return null;
  return <>{seamLines}</>;
}
