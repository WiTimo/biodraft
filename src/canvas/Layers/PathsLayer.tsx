import { Line } from 'react-konva';
import { useMemo } from 'react';

import { LinePath } from '../Paths/LinePath';
import { useCanvasState } from '../state/CanvasState';
import type { Point, Segment } from '../state/types';
import type { Line as KonvaLine } from 'konva/lib/shapes/Line';
import { generateBezierPoints, evaluateBezier } from '../state/utils';
import { useSeamDrag } from '../hooks/useSeamDrag';

export function PathsLayer() {
  const paths = useCanvasState(s => s.present.paths);
  const seams = useCanvasState(s => s.present.seams || []);
  const currentTool = useCanvasState(s => s.currentTool);
  const zoom = useCanvasState(s => s.zoom);
  const offset = useCanvasState(s => s.offset);
  const selectedSegment = useCanvasState(s => s.selectedSeamSegment);
  const setSelectedSeamSegment = useCanvasState(s => s.setSelectedSeamSegment);
  const removeSeam = useCanvasState(s => s.removeSeam);
  const setSeamSelection = useCanvasState(s => s.setSeamSelection);
  const findSeamBySegment = useCanvasState(s => s.findSeamBySegment);
  
  const pendingSeamPortion1 = useCanvasState(s => s.pendingSeamPortion1);
  const pendingSeamPortion2 = useCanvasState(s => s.pendingSeamPortion2);

  const {
    isDragging: isDraggingSeam,
    dragSegment,
    dragSegmentData,
    dragStartT,
    dragCurrentT,
    hasMoved,
    startDrag,
    calculateTFromMouse
  } = useSeamDrag();

  const previewPoints = useMemo(() => {
    if (!isDraggingSeam || !dragSegment || !dragSegmentData || !hasMoved) return [];
    
    const { p0, p1, h0, h1 } = dragSegmentData;
    const tMin = Math.min(dragStartT, dragCurrentT);
    const tMax = Math.max(dragStartT, dragCurrentT);
    
    const points: number[] = [];
    // Prevent division by zero and excessive loops
    const range = tMax - tMin;
    const numSteps = Math.max(10, Math.ceil(range * 100));
    
    for (let i = 0; i <= numSteps; i++) {
      const t = tMin + (i / numSteps) * range;
      const { x, y } = evaluateBezier(p0, h0, h1, p1, t);
      if (!isNaN(x) && !isNaN(y)) {
        points.push(x, y);
      }
    }
    return points;
  }, [isDraggingSeam, dragSegment, dragSegmentData, hasMoved, dragStartT, dragCurrentT]);

  return (
    <>
      {/* Render all actual paths visually */}
      {paths.map((path) => (
        <LinePath
          key={path.id}
          points={path.points}
          closed={path.closed}
          texture={path.texture ?? null}
        />
      ))}

      {paths.flatMap((path) => {
        const segments: any = [];
        const addBezierSegment = (a: Point, b: Point, isClosing = false) => {
          const isSelected =
            selectedSegment &&
            ((selectedSegment[0] === a.id && selectedSegment[1] === b.id) ||
              (selectedSegment[0] === b.id && selectedSegment[1] === a.id));

          const isDraggingThis = dragSegment && 
            ((dragSegment[0] === a.id && dragSegment[1] === b.id) ||
             (dragSegment[0] === b.id && dragSegment[1] === a.id));

          const isPending1 = pendingSeamPortion1 && 
            ((pendingSeamPortion1.segment[0] === a.id && pendingSeamPortion1.segment[1] === b.id) ||
             (pendingSeamPortion1.segment[0] === b.id && pendingSeamPortion1.segment[1] === a.id));
          const isPending2 = pendingSeamPortion2 && 
            ((pendingSeamPortion2.segment[0] === a.id && pendingSeamPortion2.segment[1] === b.id) ||
             (pendingSeamPortion2.segment[0] === b.id && pendingSeamPortion2.segment[1] === a.id));

          let baseColor = 'rgba(0,0,255,0.05)';
          if (isDraggingThis) {
            baseColor = 'rgba(0,255,0,0.3)';
          } else if (isPending1) {
            baseColor = 'rgba(255,150,0,0.3)';
          } else if (isPending2) {
            baseColor = 'rgba(0,150,255,0.3)';
          } else if (isSelected) {
            baseColor = 'rgba(0,0,255,0.5)';
          } else if (currentTool === 'seam') {
            baseColor = 'rgba(0,0,255,0.05)';
          } else {
            baseColor = 'transparent';
          }

          segments.push(
            <Line
              key={`bezier-click-${isClosing ? 'close-' : ''}${a.id}-${b.id}`}
              points={generateBezierPoints(a, a.handleOut, b.handleIn, b)}
              stroke={baseColor}
              strokeWidth={12 / zoom}
              name="seam-segment"
              onMouseDown={(e) => {
                if (currentTool !== 'seam') return;
                e.evt.preventDefault();
                
                const stage = e.target.getStage();
                if (!stage) return;
                
                const pointerPos = stage.getPointerPosition();
                if (!pointerPos) return;
                
                // Convert stage coordinates to world coordinates
                const worldX = (pointerPos.x - offset.x) / zoom;
                const worldY = (pointerPos.y - offset.y) / zoom;
                
                const t = calculateTFromMouse(worldX, worldY, a, a.handleOut, b.handleIn, b);
                const segment: [string, string] = [a.id, b.id];
                
                startDrag(e, segment, a, b, a.handleOut, b.handleIn, t);
              }}
              onContextMenu={(e) => {
                // right-click: prevent browser menu and remove seam if present
                if (currentTool !== 'seam') return;
                e.evt.preventDefault();
                
                const segment: Segment = [a.id, b.id];
                const seam = findSeamBySegment(segment);
                
                if (seam) {
                  const portion1 = seam[0];
                  const portion2 = seam[1];
                  const getSeg = (p: any) => p.segment || p;
                  
                  removeSeam(getSeg(portion1), getSeg(portion2));
                  setSeamSelection([]);
                  setSelectedSeamSegment(null);
                }
              }}
              onMouseEnter={(e) => {
                if (currentTool === 'seam') {
                  setSelectedSeamSegment([a.id, b.id]);
                  if (!isSelected) {
                    const line = e.target as KonvaLine;
                    line.stroke('rgba(0,0,255,0.2)');
                  }
                  e.target.getLayer()?.batchDraw();
                }
              }}
              onMouseLeave={(e) => {
                if (currentTool === 'seam') {
                  setSelectedSeamSegment(null);
                  if (!isSelected) {
                    const line = e.target as KonvaLine;
                    line.stroke(baseColor);
                  }
                  e.target.getLayer()?.batchDraw();
                }
              }}
              listening={currentTool === 'seam'}
            />
          );
        };

        for (let i = 0; i < path.points.length - 1; i++) {
          const a = path.points[i];
          const b = path.points[i + 1];
          addBezierSegment(a, b);
        }

        if (path.closed && path.points.length >= 2) {
          const a = path.points[path.points.length - 1];
          const b = path.points[0];
          addBezierSegment(a, b, true);
        }

        return segments;
      })}

      {/* Preview line during drag */}
      {previewPoints.length > 0 && (
        <Line
          points={previewPoints}
          stroke={pendingSeamPortion1 ? "rgba(0,150,255,0.8)" : "rgba(255,150,0,0.8)"}
          strokeWidth={4}
          dash={[10, 5]}
          listening={false}
        />
      )}

    </>
  );
}