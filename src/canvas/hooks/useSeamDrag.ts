import { useState, useRef, useCallback, useEffect } from 'react';
import { useCanvasState } from '../state/CanvasState';
import { evaluateBezier } from '../state/utils';
import type { Point, Handle } from '../state/types';

export function useSeamDrag() {
  const offset = useCanvasState(s => s.offset);
  const zoom = useCanvasState(s => s.zoom);
  
  const pendingSeamPortion1 = useCanvasState(s => s.pendingSeamPortion1);
  const pendingSeamPortion2 = useCanvasState(s => s.pendingSeamPortion2);
  const setPendingSeamPortion1 = useCanvasState(s => s.setPendingSeamPortion1);
  const setPendingSeamPortion2 = useCanvasState(s => s.setPendingSeamPortion2);
  const clearPendingSeamPortions = useCanvasState(s => s.clearPendingSeamPortions);
  const commitPendingSeamPortions = useCanvasState(s => s.commitPendingSeamPortions);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStartT, setDragStartT] = useState(0);
  const [dragCurrentT, setDragCurrentT] = useState(0);
  const [dragSegment, setDragSegment] = useState<[string, string] | null>(null);
  
  // Use state for drag data to ensure it's available during render
  const [dragSegmentData, setDragSegmentData] = useState<{ p0: Point; p1: Point; h0: Handle; h1: Handle } | null>(null);
  
  const stageRef = useRef<any>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const [hasMoved, setHasMoved] = useState(false);

  const calculateTFromMouse = useCallback((mouseX: number, mouseY: number, p0: Point, h0: Handle, h1: Handle, p1: Point) => {
    let closestT = 0;
    let closestDist = Infinity;
    
    // 1. Coarse search (step 0.05 = 20 steps)
    for (let t = 0; t <= 1; t += 0.05) {
      const { x, y } = evaluateBezier(p0, h0, h1, p1, t);
      const dist = Math.sqrt((x - mouseX) ** 2 + (y - mouseY) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closestT = t;
      }
    }

    // 2. Fine search around closestT (+- 0.05 with 0.005 step)
    const tMin = Math.max(0, closestT - 0.05);
    const tMax = Math.min(1, closestT + 0.05);
    
    for (let t = tMin; t <= tMax; t += 0.005) {
      const { x, y } = evaluateBezier(p0, h0, h1, p1, t);
      const dist = Math.sqrt((x - mouseX) ** 2 + (y - mouseY) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closestT = t;
      }
    }

    return closestT;
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!stageRef.current || !dragSegmentData) return;
      
      const stage = stageRef.current;
      const stageBounds = stage.container().getBoundingClientRect();
      
      const stageX = e.clientX - stageBounds.left;
      const stageY = e.clientY - stageBounds.top;
      const worldX = (stageX - offset.x) / zoom;
      const worldY = (stageY - offset.y) / zoom;
      
      if (mouseDownPosRef.current) {
        const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
        const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);
        if (dx > 3 || dy > 3) {
          setHasMoved(true);
        }
      }
      
      const { p0, p1, h0, h1 } = dragSegmentData;
      const t = calculateTFromMouse(worldX, worldY, p0, h0, h1, p1);
      setDragCurrentT(t);
    };

    const handleMouseUp = () => {
      if (!dragSegment) return;
      
      const finalize = (wasDrag: boolean) => {
          if (!wasDrag) {
            // Click behavior (full segment)
            if (!pendingSeamPortion1) {
              setPendingSeamPortion1({ segment: dragSegment, tStart: 0, tEnd: 1 });
            } else if (!pendingSeamPortion2) {
              setPendingSeamPortion2({ segment: dragSegment, tStart: 0, tEnd: 1 });
              setTimeout(() => commitPendingSeamPortions(), 0);
            } else {
              clearPendingSeamPortions();
              setPendingSeamPortion1({ segment: dragSegment, tStart: 0, tEnd: 1 });
            }
          } else {
            // Drag behavior (partial segment)
            const tStart = Math.min(dragStartT, dragCurrentT);
            const tEnd = Math.max(dragStartT, dragCurrentT);
            
            if (Math.abs(tEnd - tStart) > 0.05) {
              const portion = { segment: dragSegment, tStart, tEnd };
              if (!pendingSeamPortion1) {
                setPendingSeamPortion1(portion);
              } else if (!pendingSeamPortion2) {
                setPendingSeamPortion2(portion);
                setTimeout(() => commitPendingSeamPortions(), 0);
              } else {
                clearPendingSeamPortions();
                setPendingSeamPortion1(portion);
              }
            }
          }
          
          setIsDragging(false);
          setDragSegment(null);
          setDragSegmentData(null);
          stageRef.current = null;
          mouseDownPosRef.current = null;
          setHasMoved(false);
      };

      finalize(hasMoved);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragSegment, dragSegmentData, dragStartT, dragCurrentT, pendingSeamPortion1, pendingSeamPortion2,
      setPendingSeamPortion1, setPendingSeamPortion2, clearPendingSeamPortions, commitPendingSeamPortions, 
      calculateTFromMouse, zoom, offset, hasMoved]);

  const startDrag = useCallback((
      evt: any, 
      segment: [string, string], 
      p0: Point, p1: Point, h0: Handle, h1: Handle, 
      t: number
  ) => {
    setIsDragging(true);
    setDragSegment(segment);
    stageRef.current = evt.target.getStage();
    mouseDownPosRef.current = { x: evt.evt.clientX, y: evt.evt.clientY };
    setDragSegmentData({ p0, p1, h0, h1 });
    setDragStartT(t);
    setDragCurrentT(t);
    setHasMoved(false);
  }, []);

  return {
    isDragging,
    dragSegment,
    dragSegmentData,
    dragStartT,
    dragCurrentT,
    hasMoved,
    startDrag,
    calculateTFromMouse
  };
}