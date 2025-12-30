import { Line, Rect, Circle } from 'react-konva';
import { useMemo, useRef } from 'react';
import { useCanvasState } from '../state/CanvasState';

const cornerCursors = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize'];

function sampleCubicBezier(p0: any, p1: any, p2: any, p3: any, t: any) {
  return {
    x: (1 - t) ** 3 * p0.x + 3 * (1 - t) ** 2 * t * p1.x + 3 * (1 - t) * t ** 2 * p2.x + t ** 3 * p3.x,
    y: (1 - t) ** 3 * p0.y + 3 * (1 - t) ** 2 * t * p1.y + 3 * (1 - t) * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}
function toWorldPos(pointer: any, zoom: any, offset: any) {
  return {
    x: (pointer.x - offset.x) / zoom,
    y: (pointer.y - offset.y) / zoom,
  };
}
function getCenterAndBounds(points: any) {
  const xs = points.map((p: any) => p.x);
  const ys = points.map((p: any) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  return { minX, minY, maxX, maxY, center, width: maxX - minX, height: maxY - minY };
}

export function SelectionTransformer({ isVisible }: { isVisible: boolean }) {
  const selectedIds = useCanvasState((s) => s.selectedPointIds);
  const paths = useCanvasState((s) => s.present.paths);
  const updatePointsBatch = useCanvasState((s) => s.updatePointsBatch);
  const saveState = useCanvasState((s) => s.saveState);
  const updateTextureForPathLive = useCanvasState((s) => s.updateTextureForPathLive);
  const zoom = useCanvasState((s) => s.zoom);
  const isShiftPressed = useCanvasState((s) => s.isShiftPressed);
  

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const lockedAxisRef = useRef<"x" | "y" | null>(null);

  const dragState = useRef<Record<string, unknown> | null>(null);

  const selectedPoints = useMemo(() => {
    if (!isVisible || selectedIds.length === 0) return [];
    return paths.flatMap((p) => p.points).filter((pt) => selectedIds.includes(pt.id));
  }, [isVisible, paths, selectedIds]);

  const bounds = useMemo(() => {
    if (!isVisible || selectedPoints.length === 0) return null;

    const selectedIdSet = new Set(selectedIds);
    const allBoundingPoints: Array<{ x: number; y: number }> = [...selectedPoints];

    for (const path of paths) {
      const pts = path.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];

        if (selectedIdSet.has(p1.id) && selectedIdSet.has(p2.id)) {
          for (let t = 0; t <= 1.0; t += 0.05) {
            allBoundingPoints.push(
              sampleCubicBezier(
                { x: p1.x, y: p1.y },
                { x: p1.x + p1.handleOut.dx, y: p1.y + p1.handleOut.dy },
                { x: p2.x + p2.handleIn.dx, y: p2.y + p2.handleIn.dy },
                { x: p2.x, y: p2.y },
                t,
              ),
            );
          }
        }
      }

      if (pts.length >= 2 && path.closed) {
        const pLast = pts[pts.length - 1];
        const pFirst = pts[0];
        if (selectedIdSet.has(pLast.id) && selectedIdSet.has(pFirst.id)) {
          for (let t = 0; t <= 1.0; t += 0.05) {
            allBoundingPoints.push(
              sampleCubicBezier(
                { x: pLast.x, y: pLast.y },
                { x: pLast.x + pLast.handleOut.dx, y: pLast.y + pLast.handleOut.dy },
                { x: pFirst.x + pFirst.handleIn.dx, y: pFirst.y + pFirst.handleIn.dy },
                { x: pFirst.x, y: pFirst.y },
                t,
              ),
            );
          }
        }
      }
    }

    return getCenterAndBounds(allBoundingPoints);
  }, [isVisible, paths, selectedIds, selectedPoints]);

  if (!isVisible || selectedPoints.length === 0 || !bounds) return null;

  const { minX: rawMinX, minY: rawMinY, maxX: rawMaxX, maxY: rawMaxY } = bounds;

  // Ensure the selection bounding box has a minimum screen size so it's always draggable
  const minScreenPx = 12; // minimum size in screen pixels
  const minWorldW = minScreenPx / (zoom || 1);
  const minWorldH = minScreenPx / (zoom || 1);

  // Expand bounds if width/height are smaller than the minimum
  let minX = rawMinX;
  let maxX = rawMaxX;
  let minY = rawMinY;
  let maxY = rawMaxY;

  const curW = rawMaxX - rawMinX;
  const curH = rawMaxY - rawMinY;
  if (curW < minWorldW) {
    const extra = (minWorldW - curW) / 2;
    minX = rawMinX - extra;
    maxX = rawMaxX + extra;
  }
  if (curH < minWorldH) {
    const extra = (minWorldH - curH) / 2;
    minY = rawMinY - extra;
    maxY = rawMaxY + extra;
  }

  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const width = maxX - minX;
  const height = maxY - minY;


  const cornerPoints = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  // Keep handle size constant in screen pixels
  const HANDLE_SCREEN_BASE = 8; // px
  const HANDLE_SCREEN_MIN = 4;
  const HANDLE_SCREEN_MAX = 10;
  const handleScreenRadius = Math.min(HANDLE_SCREEN_MAX, Math.max(HANDLE_SCREEN_MIN, HANDLE_SCREEN_BASE));
  const handleRadius = handleScreenRadius / zoom;

  const onHandleDragStart = (_: any, cornerIndex: number) => {
    const corner = cornerPoints[cornerIndex];
    const centerVec = { x: corner.x - center.x, y: corner.y - center.y };
    //@ts-ignore
    dragState.current = {
      center: { ...center },
      originalPoints: selectedPoints.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        handleIn: { ...p.handleIn },
        handleOut: { ...p.handleOut },
      })),
      startVec: centerVec,
      startDistance: Math.sqrt(centerVec.x ** 2 + centerVec.y ** 2),
      startAngle: Math.atan2(centerVec.y, centerVec.x),
    };

    saveState();
  };

  const onHandleDragMove = (e: any, _cornerIndex: any) => {
    if (!dragState.current) return;

    const zoom = useCanvasState.getState().zoom;
    const offset = useCanvasState.getState().offset;

    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;

    const worldPointer = toWorldPos(pointer, zoom, offset);
    const { center, originalPoints, startDistance } = dragState.current as any;

    const currentVec = { x: worldPointer.x - center.x, y: worldPointer.y - center.y };
    const currentDistance = Math.sqrt(currentVec.x ** 2 + currentVec.y ** 2);
    const scale = currentDistance / startDistance;

    const updates = (originalPoints as any[]).map((orig) => {
      const localX = orig.x - center.x;
      const localY = orig.y - center.y;
      return {
        id: orig.id,
        x: center.x + localX * scale,
        y: center.y + localY * scale,
        handleIn: { dx: orig.handleIn.dx * scale, dy: orig.handleIn.dy * scale },
        handleOut: { dx: orig.handleOut.dx * scale, dy: orig.handleOut.dy * scale },
      };
    });

    updatePointsBatch(updates);
  };



  return (
    <>
      <Rect
        x={minX}
        y={minY}
        width={width}
        height={height}
        fill="rgba(0,0,0,0.001)"
        draggable
        name="transform-handle"
        onMouseEnter={(e) => e.target.getStage()?.container().style.setProperty('cursor', 'move')}
        onMouseLeave={(e) => e.target.getStage()?.container().style.setProperty('cursor', 'default')}
        onDragStart={(e) => {
          const pointer = e.target.getStage()?.getPointerPosition();
          if (!pointer) return;

          const zoom = useCanvasState.getState().zoom;
          const offset = useCanvasState.getState().offset;

          dragStartRef.current = toWorldPos(pointer, zoom, offset);
          lockedAxisRef.current = null;

          saveState();

          const selectedIdsSet = new Set(selectedIds);
          const originalTextures: Array<{ pathId: string; offsetX: number; offsetY: number; scaleX: number; scaleY: number }> = [];
          for (const p of paths) {
            const allSelected = p.points.every((pt: any) => selectedIdsSet.has(pt.id));
            if (!allSelected || !p.texture) continue;
            originalTextures.push({
              pathId: p.id,
              offsetX: p.texture.offsetX ?? 0,
              offsetY: p.texture.offsetY ?? 0,
              scaleX: p.texture.scaleX ?? 1,
              scaleY: p.texture.scaleY ?? 1,
            });
          }

          dragState.current = {
            originalPoints: selectedPoints.map((p) => ({
              id: p.id,
              x: p.x,
              y: p.y,
            })),
            originalTextures,
          };
        }}
        onDragMove={(e) => {
          const pointer = e.target.getStage()?.getPointerPosition();
          if (!pointer || !dragStartRef.current || !dragState.current) return;

          const zoom = useCanvasState.getState().zoom;
          const offset = useCanvasState.getState().offset;
          const worldPointer = toWorldPos(pointer, zoom, offset);

          let dx = worldPointer.x - dragStartRef.current.x;
          let dy = worldPointer.y - dragStartRef.current.y;

          if (isShiftPressed) {
            if (!lockedAxisRef.current) {
              lockedAxisRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
            }
            if (lockedAxisRef.current === "x") {
              dy = 0;
            } else {
              dx = 0;
            }
          } else {
            lockedAxisRef.current = null;
          }

          const moveSnapshot = dragState.current as { originalPoints: { id: string; x: number; y: number }[] };

          updatePointsBatch(
            moveSnapshot.originalPoints.map((orig) => ({
              id: orig.id,
              x: orig.x + dx,
              y: orig.y + dy,
            })),
          );

          // Also move textures for any fully-selected path so textures stay attached to patterns.
          // Use drag-start snapshot to avoid drift and avoid per-move history snapshots.
          const textureSnapshot = dragState.current as {
            originalTextures?: Array<{ pathId: string; offsetX: number; offsetY: number; scaleX: number; scaleY: number }>;
          };
          const originals = textureSnapshot.originalTextures ?? [];
          for (const t of originals) {
            // In Konva pattern fills, decreasing offset moves the pattern in the +axis direction.
            // When we translate the geometry by +dx/+dy, we must translate the pattern with it.
            // Offsets are applied in pattern space; when pattern is scaled, offset deltas must be
            // adjusted to keep world-space motion consistent.
            const safeScaleX = Number.isFinite(t.scaleX) && Math.abs(t.scaleX) > 1e-6 ? t.scaleX : 1;
            const safeScaleY = Number.isFinite(t.scaleY) && Math.abs(t.scaleY) > 1e-6 ? t.scaleY : 1;
            updateTextureForPathLive(t.pathId, {
              offsetX: t.offsetX - dx / safeScaleX,
              offsetY: t.offsetY - dy / safeScaleY,
            });
          }

          // Visually snap the rect back
          e.target.x(minX);
          e.target.y(minY);
        }}

        onDragEnd={(e) => {
          dragStartRef.current = null;
          dragState.current = null;
          lockedAxisRef.current = null;
          e.target.getStage()?.container().style.setProperty('cursor', 'default')
        }}
      />


      <Line
        points={[...cornerPoints, cornerPoints[0]].flatMap((p) => [p.x, p.y])}
        closed
        stroke="deepskyblue"
        strokeWidth={1.5 / zoom}
        listening={false}
      />

      {cornerPoints.map((p, idx) => (
        <Circle
          key={`corner-${idx}`}
          x={p.x}
          y={p.y}
          radius={handleRadius}
          fill="#2196F3"
          draggable
          name="transform-handle"
          onMouseEnter={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = cornerCursors[idx];
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = 'default';
          }}
          onDragStart={(e) => {
            e.target.getStage()?.container().style.setProperty('cursor', 'grabbing');
            onHandleDragStart(e, idx);
          }}
          onDragMove={(e) => onHandleDragMove(e, idx)}
          onDragEnd={(e) => {
            saveState();
            dragState.current = null;
            e.target.getStage()?.container().style.setProperty('cursor', 'default');
          }}
        />
      ))}
    </>
  );
}