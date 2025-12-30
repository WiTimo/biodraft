import { Line, Group } from 'react-konva';

import { LinePath } from '../Paths/LinePath';
import { useCanvasState } from '../state/CanvasState';
import type { Handle, Point, Segment } from '../state/types';
import type { Line as KonvaLine } from 'konva/lib/shapes/Line';
import { useState, useCallback, useRef, useEffect } from 'react';
import { evaluateBezier, generateBezierPoints, segmentsEqual } from '../state/utils';

const seamPartToSegment = (part: any): Segment => part.segment || part;

export function PathsLayer() {
  const paths = useCanvasState(s => s.present.paths);
  const seams = useCanvasState(s => s.present.seams || []);
  const currentTool = useCanvasState(s => s.currentTool);
  const zoom = useCanvasState(s => s.zoom);
  const offset = useCanvasState(s => s.offset);
  const selectedSegment = useCanvasState(s => s.selectedSeamSegment);
  const setSelectedSeamSegment = useCanvasState(s => s.setSelectedSeamSegment);
  
  // Drag-based seaming state
  const pendingSeamPortion1 = useCanvasState(s => s.pendingSeamPortion1);
  const pendingSeamPortion2 = useCanvasState(s => s.pendingSeamPortion2);
  const setPendingSeamPortion1 = useCanvasState(s => s.setPendingSeamPortion1);
  const setPendingSeamPortion2 = useCanvasState(s => s.setPendingSeamPortion2);
  const clearPendingSeamPortions = useCanvasState(s => s.clearPendingSeamPortions);
  const commitPendingSeamPortions = useCanvasState(s => s.commitPendingSeamPortions);

  // Local drag state
  const [isDraggingSeam, setIsDraggingSeam] = useState(false);
  const [dragStartT, setDragStartT] = useState<number>(0);
  const [dragCurrentT, setDragCurrentT] = useState<number>(0);
  const [dragSegment, setDragSegment] = useState<[string, string] | null>(null);
  const dragSegmentPointsRef = useRef<{ p0: Point; p1: Point; h0: Handle; h1: Handle } | null>(null);
  const stageRef = useRef<any>(null);
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);
  const [hasMoved, setHasMoved] = useState(false);

  // Texture-drag state for texture-select tool
  const updateTextureForPath = useCanvasState(s => s.updateTextureForPath);
  const [isDraggingTexture, setIsDraggingTexture] = useState(false);
  const [textureDragPathId, setTextureDragPathId] = useState<string | null>(null);
  const [textureDragStart, setTextureDragStart] = useState<{ x: number; y: number } | null>(null);
  const [textureDragOriginalOffset, setTextureDragOriginalOffset] = useState<{ x: number; y: number } | null>(null);
  const [textureStageRef, setTextureStageRef] = useState<any>(null);

  // Helper to calculate t value (0-1) along a bezier curve from mouse position
  const calculateTFromMouse = useCallback((mouseX: number, mouseY: number, p0: Point, h0: Handle, h1: Handle, p1: Point) => {
    // Find closest point on curve by sampling
    let closestT = 0;
    let closestDist = Infinity;
    
    for (let t = 0; t <= 1; t += 0.005) {
      const { x, y } = evaluateBezier(p0, h0, h1, p1, t);
      const dist = Math.sqrt((x - mouseX) ** 2 + (y - mouseY) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closestT = t;
      }
    }
    
    return closestT;
  }, []);

  // Handle global mouse move and up
  useEffect(() => {
    if (!isDraggingSeam) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!stageRef.current || !dragSegmentPointsRef.current) return;
      
      const stage = stageRef.current;
      const stageBounds = stage.container().getBoundingClientRect();
      
      // Convert screen coordinates to stage coordinates, then to world coordinates
      const stageX = e.clientX - stageBounds.left;
      const stageY = e.clientY - stageBounds.top;
      const worldX = (stageX - offset.x) / zoom;
      const worldY = (stageY - offset.y) / zoom;
      
      // Check if mouse has moved significantly (more than 3 pixels)
      if (mouseDownPos) {
        const dx = Math.abs(e.clientX - mouseDownPos.x);
        const dy = Math.abs(e.clientY - mouseDownPos.y);
        if (dx > 3 || dy > 3) {
          setHasMoved(true);
        }
      }
      
      const { p0, p1, h0, h1 } = dragSegmentPointsRef.current;
      const t = calculateTFromMouse(worldX, worldY, p0, h0, h1, p1);
      setDragCurrentT(t);
    };

    const handleMouseUp = () => {
      if (!dragSegment) return;
      
      // If mouse hasn't moved, treat it as a click for full-path seaming
      if (!hasMoved) {
        // Full path seaming (old behavior)
        if (!pendingSeamPortion1) {
          // First selection - select entire segment (0 to 1)
          setPendingSeamPortion1({
            segment: dragSegment,
            tStart: 0,
            tEnd: 1,
          });
        } else if (!pendingSeamPortion2) {
          // Second selection - create seam with entire segment
          setPendingSeamPortion2({
            segment: dragSegment,
            tStart: 0,
            tEnd: 1,
          });
          setTimeout(() => commitPendingSeamPortions(), 0);
        } else {
          // Already have two portions, clear and start fresh
          clearPendingSeamPortions();
          setPendingSeamPortion1({
            segment: dragSegment,
            tStart: 0,
            tEnd: 1,
          });
        }
      } else {
        // Mouse has moved - partial seaming
        const tStart = Math.min(dragStartT, dragCurrentT);
        const tEnd = Math.max(dragStartT, dragCurrentT);
        
        // Only create portion if there's meaningful selection (> 5% of segment)
        if (Math.abs(tEnd - tStart) > 0.05) {
          const portion = {
            segment: dragSegment,
            tStart,
            tEnd,
          };
          
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
      
      setIsDraggingSeam(false);
      setDragSegment(null);
      dragSegmentPointsRef.current = null;
      stageRef.current = null;
      setMouseDownPos(null);
      setHasMoved(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSeam, dragSegment, dragStartT, dragCurrentT, pendingSeamPortion1, pendingSeamPortion2,
      setPendingSeamPortion1, setPendingSeamPortion2, clearPendingSeamPortions, commitPendingSeamPortions, 
      calculateTFromMouse, zoom, offset, mouseDownPos, hasMoved]);

  // Handle texture drag global mouse events
  useEffect(() => {
    if (!isDraggingTexture || !textureStageRef || !textureDragPathId || !textureDragStart || !textureDragOriginalOffset) return;

    const handleMouseMove = (e: MouseEvent) => {
      const stage = textureStageRef;
      const stageBounds = stage.container().getBoundingClientRect();
      const stageX = e.clientX - stageBounds.left;
      const stageY = e.clientY - stageBounds.top;
      const worldX = (stageX - offset.x) / zoom;
      const worldY = (stageY - offset.y) / zoom;

      const dx = worldX - textureDragStart.x;
      const dy = worldY - textureDragStart.y;

      // Invert direction so dragging feels natural (dragging right moves texture to the right)
      updateTextureForPath(textureDragPathId, {
        offsetX: textureDragOriginalOffset.x - dx,
        offsetY: textureDragOriginalOffset.y - dy,
      });
    };

    const handleMouseUp = () => {
      if (textureStageRef && textureStageRef.container) {
        textureStageRef.container().style.cursor = 'default';
      }
      setIsDraggingTexture(false);
      setTextureDragPathId(null);
      setTextureDragStart(null);
      setTextureDragOriginalOffset(null);
      setTextureStageRef(null);

      // clear texture interaction flag so stage zoom resumes
      useCanvasState.getState().setTextureInteractionActive(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTexture, textureStageRef, textureDragPathId, textureDragStart, textureDragOriginalOffset, updateTextureForPath, zoom, offset]);

  const [hoveredPathId, setHoveredPathId] = useState<string | null>(null);
  const selectPoint = useCanvasState(s => s.selectPoint);

  return (
    <>
      {/* Render all actual paths visually */}
      {paths.map((path) => (
        <Group key={path.id}>
          <LinePath
            key={`linepath-${path.id}`}
            points={path.points}
            closed={path.closed}
            texture={path.texture ?? null}
            highlighted={currentTool === 'select' && path.closed && hoveredPathId === path.id}
          />

          {/* Invisible overlay to capture hover/click for selection (works reliably across Konva shapes) */}
          {path.closed && (currentTool === 'select' || currentTool === 'texture') && (() => {
            // Build sampled points for the entire path (closed)
            const sampled: number[] = [];
            for (let i = 0; i < path.points.length - 1; i++) {
              const a = path.points[i];
              const b = path.points[i + 1];
              sampled.push(...generateBezierPoints(a, a.handleOut, b.handleIn, b, 20));
            }
            if (path.closed && path.points.length >= 2) {
              const a = path.points[path.points.length - 1];
              const b = path.points[0];
              sampled.push(...generateBezierPoints(a, a.handleOut, b.handleIn, b, 20));
            }

            // Closed fill overlay to capture interior hover/clicks reliably
            return (
              <Line
                key={`fill-overlay-${path.id}`}
                name={`fill-overlay`}
                points={sampled}
                closed
                fill={hoveredPathId === path.id ? 'rgba(0,120,255,0.06)' : 'rgba(0,0,0,0.001)'}
                strokeWidth={0}
                listening={true}
                onMouseEnter={(e) => {
                  setHoveredPathId(path.id);
                  const stage = e.target.getStage();
                  if (stage) stage.container().style.cursor = 'pointer';

                  // If we're in texture tool, mark interaction active so stage zoom is suppressed
                  if (currentTool === 'texture') {
                    const state = useCanvasState.getState();
                    state.setTextureInteractionActive(true);
                    state.setTextureLastInteractionAt(Date.now());
                  }
                }}
                onMouseLeave={(e) => {
                  if (hoveredPathId === path.id) setHoveredPathId(null);
                  const stage = e.target.getStage();
                  if (stage) stage.container().style.cursor = 'default';

                  // Only clear the texture interaction flag when we're NOT currently dragging the texture.
                  // This prevents stage zoom from resuming while the user is in the middle of a texture drag
                  // (i.e., clicked and is moving the mouse). The global mouseup handler will clear the flag
                  // when the drag ends.
                  if (currentTool === 'texture' && !isDraggingTexture) {
                    useCanvasState.getState().setTextureInteractionActive(false);
                  }
                }}
                onMouseDown={(e) => {
                  if (currentTool === 'select') {
                    const ids = path.points.map((p) => p.id);
                    const state = useCanvasState.getState();
                    if (ids.length === 1) {
                      state.selectPoint(ids[0]);
                    } else {
                      state.setSelectedPointIds(ids);
                      state.deselectPoint();
                    }
                    return;
                  }

                  // Texture tool: start dragging texture offset for this path
                  if (currentTool === 'texture') {
                    e.evt.preventDefault();
                    const stage = e.target.getStage();
                    if (!stage) return;
                    const pointer = stage.getPointerPosition();
                    if (!pointer) return;

                    const { offsetX = 0, offsetY = 0 } = path.texture ?? {};
                    const worldX = (pointer.x - offset.x) / zoom;
                    const worldY = (pointer.y - offset.y) / zoom;

                    // Start drag
                    setIsDraggingTexture(true);
                    setTextureDragPathId(path.id);
                    setTextureDragStart({ x: worldX, y: worldY });
                    setTextureDragOriginalOffset({ x: offsetX, y: offsetY });

                    // set stage ref for global mouse handlers
                    setTextureStageRef(stage);
                    stage.container().style.cursor = 'grabbing';

                    // mark active so stage wheel won't zoom while dragging texture
                    const st = useCanvasState.getState();
                    st.setTextureInteractionActive(true);
                    st.setTextureLastInteractionAt(Date.now());
                  }
                }}
                onWheel={(e) => {
                  // Ctrl + wheel over a textured path should scale the texture, not the canvas
                  if (currentTool !== 'texture') return;
                  if (!e.evt.ctrlKey && !e.evt.metaKey) return;

                  e.evt.preventDefault();
                  // stop propagation so the stage-level zoom handler doesn't run
                  try {
                    // Try stopping both DOM and Konva propagation
                    if (e.evt.stopImmediatePropagation) e.evt.stopImmediatePropagation();
                    if (e.evt.stopPropagation) e.evt.stopPropagation();
                    (e as any).cancelBubble = true;
                  } catch (err) { /* ignore */ }

                  const stage = e.target.getStage();
                  if (!stage) return;
                  const pointer = stage.getPointerPosition();
                  if (!pointer) return;

                  // record interaction timestamp so stage zoom is suppressed even if events race
                  useCanvasState.getState().setTextureLastInteractionAt(Date.now());

                  const delta = e.evt.deltaY;
                  const sensitivity = 0.0015; // tweak for comfortable scaling speed
                  const rawFactor = Math.exp(-delta * sensitivity);
                  const minFactor = 0.01;
                  const maxFactor = 100;
                  const factor = Math.max(minFactor, Math.min(maxFactor, rawFactor));

                  const curScaleX = path.texture?.scaleX ?? 1;
                  const curScaleY = path.texture?.scaleY ?? 1;
                  const newScaleX = Math.max(0.01, curScaleX * factor);
                  const newScaleY = Math.max(0.01, curScaleY * factor);

                  // Scale around the pointer position so the visual point under the cursor stays steady
                  const worldX = (pointer.x - offset.x) / zoom;
                  const worldY = (pointer.y - offset.y) / zoom;

                  const oldOffsetX = path.texture?.offsetX ?? 0;
                  const oldOffsetY = path.texture?.offsetY ?? 0;

                  const adjustedOffsetX = (oldOffsetX - worldX) * (newScaleX / curScaleX) + worldX;
                  const adjustedOffsetY = (oldOffsetY - worldY) * (newScaleY / curScaleY) + worldY;

                  updateTextureForPath(path.id, {
                    scaleX: newScaleX,
                    scaleY: newScaleY,
                    offsetX: adjustedOffsetX,
                    offsetY: adjustedOffsetY,
                  });
                }}
                onMouseUp={(e) => {
                  // Nothing here; drag end is handled by global mouseup
                }}
              />
            );
          })()}
        </Group>
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

                const state = useCanvasState.getState();

                // If delete mode is armed, remove the seam that contains this segment
                if (state.seamDeleteMode) {
                  const targetSegment: Segment = [a.id, b.id];
                  const seamToRemove = seams.find(([partA, partB]) => {
                    const segA = seamPartToSegment(partA as any);
                    const segB = seamPartToSegment(partB as any);
                    return segmentsEqual(segA, targetSegment) || segmentsEqual(segB, targetSegment);
                  });

                  if (seamToRemove) {
                    const [partA, partB] = seamToRemove;
                    state.removeSeam(seamPartToSegment(partA as any), seamPartToSegment(partB as any));
                    state.setSeamSelection([]);
                    setSelectedSeamSegment(null);
                  }

                  state.setSeamDeleteMode(false);
                  return;
                }
                
                const stage = e.target.getStage();
                if (!stage) return;
                
                const pointerPos = stage.getPointerPosition();
                if (!pointerPos) return;
                
                // Store screen coordinates for click detection
                setMouseDownPos({ x: e.evt.clientX, y: e.evt.clientY });
                setHasMoved(false);
                
                // Convert stage coordinates to world coordinates
                const worldX = (pointerPos.x - offset.x) / zoom;
                const worldY = (pointerPos.y - offset.y) / zoom;
                
                const t = calculateTFromMouse(worldX, worldY, a, a.handleOut, b.handleIn, b);
                
                // Store segment in ORIGINAL order (a.id, b.id)
                const segment: [string, string] = [a.id, b.id];
                
                setIsDraggingSeam(true);
                setDragSegment(segment);
                stageRef.current = stage;
                dragSegmentPointsRef.current = { p0: a, p1: b, h0: a.handleOut, h1: b.handleIn };
                setDragStartT(t);
                setDragCurrentT(t);
              }}
              onClick={() => {
                // Disable old click behavior - only drag-based seaming now
              }}
              onContextMenu={(e) => {
                // right-click: prevent browser menu and remove seam if present
                if (currentTool !== 'seam') return;
                e.evt.preventDefault();
                const normalize = ([id1, id2]: [string, string]) => [id1, id2].sort() as [string, string];
                const target = normalize([a.id, b.id]);
                const state = useCanvasState.getState();
                const isUsedInSeam = seams.some((seam) => {
                  const portion1 = seam[0] as any;
                  const portion2 = seam[1] as any;
                  const seg1 = normalize((portion1.segment || portion1) as [string, string]);
                  const seg2 = normalize((portion2.segment || portion2) as [string, string]);
                  return (
                    seg1[0] === target[0] && seg1[1] === target[1] ||
                    seg2[0] === target[0] && seg2[1] === target[1]
                  );
                });
                if (isUsedInSeam) {
                  for (const seam of seams) {
                    const portion1 = seam[0] as any;
                    const portion2 = seam[1] as any;
                    const seg1 = normalize((portion1.segment || portion1) as [string, string]);
                    const seg2 = normalize((portion2.segment || portion2) as [string, string]);
                    if ((seg1[0] === target[0] && seg1[1] === target[1]) || (seg2[0] === target[0] && seg2[1] === target[1])) {
                      const s1 = (portion1.segment || portion1) as [string, string];
                      const s2 = (portion2.segment || portion2) as [string, string];
                      state.removeSeam(s1, s2);
                      state.setSeamSelection([]);
                      setSelectedSeamSegment(null);
                      break;
                    }
                  }
                }
              }}
              onMouseEnter={(e) => {
                if (currentTool === 'seam') {
                  setSelectedSeamSegment([a.id, b.id]);
                  const state = useCanvasState.getState();
                  if (!isSelected) {
                    const line = e.target as KonvaLine;
                    if (state.seamDeleteMode) {
                      line.stroke('rgba(230,67,67,0.6)');
                      line.strokeWidth(16 / zoom);
                      const stage = e.target.getStage();
                      if (stage) stage.container().style.cursor = 'pointer';
                    } else {
                      line.stroke('rgba(0,0,255,0.2)');
                    }
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
                    line.strokeWidth(12 / zoom);
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = 'default';
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
      {isDraggingSeam && dragSegment && dragSegmentPointsRef.current && hasMoved && (() => {
        const { p0, p1, h0, h1 } = dragSegmentPointsRef.current;
        
        const tMin = Math.min(dragStartT, dragCurrentT);
        const tMax = Math.max(dragStartT, dragCurrentT);
        
        // Generate points only for the selected portion
        const previewPoints: number[] = [];
        const numSteps = Math.max(10, Math.ceil((tMax - tMin) * 100));
        
        for (let i = 0; i <= numSteps; i++) {
          const t = tMin + (i / numSteps) * (tMax - tMin);
          const { x, y } = evaluateBezier(p0, h0, h1, p1, t);
          previewPoints.push(x, y);
        }
        
        return (
          <Line
            points={previewPoints}
            stroke={pendingSeamPortion1 ? "rgba(0,150,255,0.8)" : "rgba(255,150,0,0.8)"}
            strokeWidth={4 / zoom}
            listening={false}
          />
        );
      })()}

    </>
  );
}
