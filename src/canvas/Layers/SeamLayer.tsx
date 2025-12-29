import { Line } from 'react-konva';
import type { Line as KonvaLine } from 'konva/lib/shapes/Line';
import { useCanvasState } from '../state/CanvasState';
import { useMemo } from 'react';
import { evaluateBezier } from '../state/utils';

function getLine(p1: any, p2: any) {
  return [p1.x, p1.y, p2.x, p2.y];
}

function findPoint(paths: any[], id: string) {
  for (const path of paths) {
    const found = path.points.find((p: any) => p.id === id);
    if (found) return found;
  }
  return null;
}

// Helper to render a curve portion
function renderCurvePortion(p0: any, p1: any, tStart: number, tEnd: number) {
  const points: number[] = [];
  const numSteps = Math.max(10, Math.ceil((tEnd - tStart) * 100));
  
  for (let i = 0; i <= numSteps; i++) {
    const t = tStart + (i / numSteps) * (tEnd - tStart);
    const { x, y } = evaluateBezier(p0, p0.handleOut, p1.handleIn, p1, t);
    points.push(x, y);
  }
  return points;
}

// Helper to get a point at specific t on a bezier curve
function getPointAtT(p0: any, p1: any, t: number) {
  return evaluateBezier(p0, p0.handleOut, p1.handleIn, p1, t);
}

export function SeamLayer() {
  const paths = useCanvasState(s => s.present.paths);
  const seams = useCanvasState(s => s.present.seams);
  const currentTool = useCanvasState(s => s.currentTool);
  const pendingSeamPortion1 = useCanvasState(s => s.pendingSeamPortion1);
  const pendingSeamPortion2 = useCanvasState(s => s.pendingSeamPortion2);
  const swapSeamPortion = useCanvasState(s => s.swapSeamPortion);
  
  const handleSwapSeam = (seamIndex: number) => {
    if (swapSeamPortion) {
      swapSeamPortion(seamIndex);
    }
  };
  
  const seamLines = useMemo(() => {
    return seams.flatMap((seam, i) => {
      // Check if it's a portion-based seam or old-style seam
      const portion1 = seam[0] as any;
      const portion2 = seam[1] as any;
      
      const isPortionSeam = portion1.segment && portion1.tStart !== undefined;
      
      if (isPortionSeam) {
        // New portion-based seam
        const p0_1 = findPoint(paths, portion1.segment[0]);
        const p1_1 = findPoint(paths, portion1.segment[1]);
        const p0_2 = findPoint(paths, portion2.segment[0]);
        const p1_2 = findPoint(paths, portion2.segment[1]);
        
        if (!p0_1 || !p1_1 || !p0_2 || !p1_2) return [];
        
        // Get start and end points of each portion
        const start1 = getPointAtT(p0_1, p1_1, portion1.tStart);
        const end1 = getPointAtT(p0_1, p1_1, portion1.tEnd);
        const start2 = getPointAtT(p0_2, p1_2, portion2.tStart);
        const end2 = getPointAtT(p0_2, p1_2, portion2.tEnd);
        
        return [
          <Line
            key={`seam-portion-${i}-1`}
            points={renderCurvePortion(p0_1, p1_1, portion1.tStart, portion1.tEnd)}
            stroke={"orange"}
            strokeWidth={2 / useCanvasState.getState().zoom}
            dash={[10, 5]}
            listening={false}
          />,
          <Line
            key={`seam-portion-${i}-2`}
            points={renderCurvePortion(p0_2, p1_2, portion2.tStart, portion2.tEnd)}
            stroke={"orange"}
            strokeWidth={2 / useCanvasState.getState().zoom}
            dash={[10, 5]}
            listening={false}
          />,
          // Connection line from start to start (clickable)
          <Line
            key={`seam-connection-${i}-start`}
            points={[start1.x, start1.y, start2.x, start2.y]}
            stroke={"rgba(255, 165, 0, 0.6)"}
            strokeWidth={3 / useCanvasState.getState().zoom}
            listening={true}
            onClick={() => {
              const state = useCanvasState.getState();
              if (state.seamDeleteMode) {
                const s1 = portion1.segment || portion1;
                const s2 = portion2.segment || portion2;
                state.removeSeam(s1, s2);
                state.setSeamSelection([]);
                state.setSeamDeleteMode(false);
                return;
              }
              handleSwapSeam(i);
            }}
            onMouseEnter={(e) => {
              const line = e.target as unknown as KonvaLine;
              if (useCanvasState.getState().seamDeleteMode) {
                line.stroke("rgba(230, 67, 67, 1)");
                line.strokeWidth(5 / useCanvasState.getState().zoom);
              } else {
                line.stroke("rgba(255, 100, 0, 1)");
                line.strokeWidth(4 / useCanvasState.getState().zoom);
              }
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'pointer';
            }}
            onMouseLeave={(e) => {
              const line = e.target as unknown as KonvaLine;
              line.stroke(useCanvasState.getState().seamDeleteMode ? "rgba(255, 165, 0, 0.6)" : "rgba(255, 165, 0, 0.6)");
              line.strokeWidth(3 / useCanvasState.getState().zoom);
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
          />,
          // Connection line from end to end (clickable)
          <Line
            key={`seam-connection-${i}-end`}
            points={[end1.x, end1.y, end2.x, end2.y]}
            stroke={"rgba(255, 165, 0, 0.6)"}
            strokeWidth={3 / useCanvasState.getState().zoom}
            listening={true}
            onClick={() => {
              const state = useCanvasState.getState();
              if (state.seamDeleteMode) {
                const s1 = portion1.segment || portion1;
                const s2 = portion2.segment || portion2;
                state.removeSeam(s1, s2);
                state.setSeamSelection([]);
                state.setSeamDeleteMode(false);
                return;
              }
              handleSwapSeam(i);
            }}
            onMouseEnter={(e) => {
              const line = e.target as unknown as KonvaLine;
              if (useCanvasState.getState().seamDeleteMode) {
                line.stroke("rgba(230, 67, 67, 1)");
                line.strokeWidth(5 / useCanvasState.getState().zoom);
              } else {
                line.stroke("rgba(255, 100, 0, 1)");
                line.strokeWidth(4 / useCanvasState.getState().zoom);
              }
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'pointer';
            }}
            onMouseLeave={(e) => {
              const line = e.target as unknown as KonvaLine;
              line.stroke(useCanvasState.getState().seamDeleteMode ? "rgba(255, 165, 0, 0.6)" : "rgba(255, 165, 0, 0.6)");
              line.strokeWidth(3 / useCanvasState.getState().zoom);
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
          />,
        ];
      } else {
        // Old-style seam (straight line between points)
        const [a1, b1] = portion1 as [string, string];
        const [a2, b2] = portion2 as [string, string];
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
            strokeWidth={2 / useCanvasState.getState().zoom}
            dash={[10, 5]}
            listening={true}
            onClick={() => {
              const state = useCanvasState.getState();
              if (state.seamDeleteMode) {
                const s1 = portion1 as [string, string];
                const s2 = portion2 as [string, string];
                state.removeSeam(s1, s2);
                state.setSeamSelection([]);
                state.setSeamDeleteMode(false);
              }
            }}
            onMouseEnter={(e) => {
              const line = e.target as unknown as KonvaLine;
              line.stroke(useCanvasState.getState().seamDeleteMode ? "rgba(230, 67, 67, 1)" : "rgba(255, 140, 0, 1)");
              line.strokeWidth(useCanvasState.getState().seamDeleteMode ? 4 / useCanvasState.getState().zoom : 3 / useCanvasState.getState().zoom);
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'pointer';
            }}
            onMouseLeave={(e) => {
              const line = e.target as unknown as KonvaLine;
              line.stroke("orange");
              line.strokeWidth(2 / useCanvasState.getState().zoom);
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
          />,
          <Line
            key={`seam-${i}-2`}
            points={getLine(pB1, pB2)}
            stroke={"orange"}
            strokeWidth={2 / useCanvasState.getState().zoom}
            dash={[10, 5]}
            listening={true}
            onClick={() => {
              const state = useCanvasState.getState();
              if (state.seamDeleteMode) {
                const s1 = portion1 as [string, string];
                const s2 = portion2 as [string, string];
                state.removeSeam(s1, s2);
                state.setSeamSelection([]);
                state.setSeamDeleteMode(false);
              }
            }}
            onMouseEnter={(e) => {
              const line = e.target as unknown as KonvaLine;
              line.stroke(useCanvasState.getState().seamDeleteMode ? "rgba(230, 67, 67, 1)" : "rgba(255, 140, 0, 1)");
              line.strokeWidth(useCanvasState.getState().seamDeleteMode ? 4 / useCanvasState.getState().zoom : 3 / useCanvasState.getState().zoom);
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'pointer';
            }}
            onMouseLeave={(e) => {
              const line = e.target as unknown as KonvaLine;
              line.stroke("orange");
              line.strokeWidth(2 / useCanvasState.getState().zoom);
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
          />,
        ];
      }
    }).filter(Boolean);
  }, [paths, seams]);
  
  // Render pending seam portions
  const renderPendingPortion = (portion: typeof pendingSeamPortion1, color: string, key: string) => {
    if (!portion) return null;
    
    const p0 = findPoint(paths, portion.segment[0]);
    const p1 = findPoint(paths, portion.segment[1]);
    if (!p0 || !p1) return null;
    
    const previewPoints: number[] = [];
    const numSteps = Math.max(10, Math.ceil((portion.tEnd - portion.tStart) * 100));
    
    for (let i = 0; i <= numSteps; i++) {
      const t = portion.tStart + (i / numSteps) * (portion.tEnd - portion.tStart);
      const { x, y } = evaluateBezier(p0, p0.handleOut, p1.handleIn, p1, t);
      previewPoints.push(x, y);
    }
    
    return (
      <Line
        key={key}
        points={previewPoints}
        stroke={color}
        strokeWidth={3 / useCanvasState.getState().zoom}
        dash={[8, 4]}
        listening={false}
      />
    );
  };
  
  if(!currentTool || currentTool !== "seam") return null;
  
  return (
    <>
      {seamLines}
      {renderPendingPortion(pendingSeamPortion1, "rgba(255,150,0,0.8)", "pending-1")}
      {renderPendingPortion(pendingSeamPortion2, "rgba(0,150,255,0.8)", "pending-2")}
    </>
  );
}
