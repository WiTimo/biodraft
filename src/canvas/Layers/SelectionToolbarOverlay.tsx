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

export function SelectionToolbarOverlay() {
  const paths = useCanvasState((s) => s.present.paths);
  const selectedIds = useCanvasState((s) => s.selectedPointIds);
  const zoom = useCanvasState((s) => s.zoom);
  const offset = useCanvasState((s) => s.offset);
  const movePoint = useCanvasState((s) => s.movePoint);
  const moveHandle = useCanvasState((s) => s.moveHandle);
  const saveState = useCanvasState((s) => s.saveState);
  
  // removed setTool usage (Move button removed)

  const selectedPoints = useMemo(() => {
    return paths.flatMap((p) => p.points).filter((pt) => selectedIds.includes(pt.id));
  }, [paths, selectedIds]);

  const box = useMemo(() => getCenter(selectedPoints), [selectedPoints]);
  if (!box) return null;

  // Convert world coordinates to screen pixels
  const screenX = box.centerX * zoom + offset.x;
  const screenMinY = box.minY * zoom + offset.y;

  const applyToSelection = (fn: (p: any) => { x: number; y: number; handleIn: { dx: number; dy: number }; handleOut: { dx: number; dy: number } }) => {
    if (!selectedPoints.length) return;
    const originals = selectedPoints.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      handleIn: { dx: p.handleIn.dx, dy: p.handleIn.dy },
      handleOut: { dx: p.handleOut.dx, dy: p.handleOut.dy },
    }));
    saveState();
    originals.forEach((orig) => {
      const next = fn(orig);
      movePoint(orig.id, next.x, next.y);
      moveHandle(orig.id, 'handleIn', next.handleIn.dx, next.handleIn.dy, false, true);
      moveHandle(orig.id, 'handleOut', next.handleOut.dx, next.handleOut.dy, false, true);
    });
  };

  const rotate = (angle: number) => {
    const cx = box.centerX;
    const cy = box.centerY;
    applyToSelection((orig) => {
      const dx = orig.x - cx;
      const dy = orig.y - cy;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const nx = dx * cos - dy * sin;
      const ny = dx * sin + dy * cos;
      const hinx = orig.handleIn.dx * cos - orig.handleIn.dy * sin;
      const hiny = orig.handleIn.dx * sin + orig.handleIn.dy * cos;
      const houx = orig.handleOut.dx * cos - orig.handleOut.dy * sin;
      const houy = orig.handleOut.dx * sin + orig.handleOut.dy * cos;
      return { x: cx + nx, y: cy + ny, handleIn: { dx: hinx, dy: hiny }, handleOut: { dx: houx, dy: houy } };
    });
  };

  const flip = (axis: 'horizontal' | 'vertical') => {
    const cx = box.centerX;
    const cy = box.centerY;
    applyToSelection((orig) => {
      const nx = axis === 'horizontal' ? cx - (orig.x - cx) : orig.x;
      const ny = axis === 'vertical' ? cy - (orig.y - cy) : orig.y;
      const hinx = axis === 'horizontal' ? -orig.handleIn.dx : orig.handleIn.dx;
      const houx = axis === 'horizontal' ? -orig.handleOut.dx : orig.handleOut.dx;
      const hiny = axis === 'vertical' ? -orig.handleIn.dy : orig.handleIn.dy;
      const houy = axis === 'vertical' ? -orig.handleOut.dy : orig.handleOut.dy;
      return { x: nx, y: ny, handleIn: { dx: hinx, dy: hiny }, handleOut: { dx: houx, dy: houy } };
    });
  };

  // Toolbar style
  const toolbarWidth = 240;
  const toolbarHeight = 40;
  const left = Math.round(screenX - toolbarWidth / 2);
  // Place toolbar above the selection's top (minY) with a margin; clamp to stay inside the canvas
  const margin = 12; // px
  const proposedTop = Math.round(screenMinY - toolbarHeight - margin);
  const top = Math.max(8, proposedTop);

  return (
    <div
      style={{
        position: 'absolute',
        left: left,
        top: top,
        width: toolbarWidth,
        height: toolbarHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 8,
        padding: 6,
        background: 'rgba(249,250,251,0.98)',
        borderRadius: 8,
        zIndex: 4000,
        boxShadow: '0 6px 18px rgba(2,6,23,0.06)',
        color: '#0f172a',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <button onClick={() => rotate(-Math.PI / 2)} style={{ padding: '6px 8px', cursor: 'pointer' }} title="Rotate Left">
        <img src="/svg/rotate-left.svg" style={{ width: 18, height: 18 }} />
      </button>
      <button onClick={() => rotate(Math.PI / 2)} style={{ padding: '6px 8px', cursor: 'pointer' }} title="Rotate Right">
        <img src="/svg/rotate-right.svg" style={{ width: 18, height: 18 }} />
      </button>
      <button onClick={() => flip('horizontal')} style={{ padding: '6px 8px', cursor: 'pointer' }} title="Flip Horizontal">
        <img src="/svg/flip-horizontal.svg" style={{ width: 18, height: 18 }} />
      </button>
      <button onClick={() => flip('vertical')} style={{ padding: '6px 8px', cursor: 'pointer' }} title="Flip Vertical">
        <img src="/svg/flip-vertical.svg" style={{ width: 18, height: 18 }} />
      </button>
    </div>
  );
}

export default SelectionToolbarOverlay;
