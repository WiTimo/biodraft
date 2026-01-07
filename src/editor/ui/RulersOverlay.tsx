import { useEffect, useMemo, useRef } from 'react';
import { useCanvasState } from '../state/CanvasState';

import { formatRulerNumber, getStep } from '../utils/grid';

// World units in this editor are treated as centimeters.
// Labels will be shown in mm, cm, or in depending on settings.
const MM_PER_WORLD_UNIT = 10;

const DEFAULT_BASE_PIXEL_GRID_SIZE = 30;
const DEFAULT_MIN_LABEL_SPACING_PX = 60;

export function RulersOverlay({
  width,
  height,
  zoom,
  offset,
  rulerSize = 24,
  basePixelGridSize = DEFAULT_BASE_PIXEL_GRID_SIZE,
  minLabelSpacingPx = DEFAULT_MIN_LABEL_SPACING_PX,
  showLeft = true,
  showTop = true,
}: {
  width: number;
  height: number;
  zoom: number;
  offset: { x: number; y: number };
  rulerSize?: number;
  basePixelGridSize?: number;
  minLabelSpacingPx?: number;
  showLeft?: boolean;
  showTop?: boolean;
}) {
  const topCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);


  const units = useCanvasState((s) => s.units);
  const metricUnit = useCanvasState((s) => s.metricUnit);

  const viewport = useMemo(() => {
    const w = Math.max(0, width);
    const h = Math.max(0, height);
    if (w === 0 || h === 0 || zoom <= 0) {
      return null;
    }

    const worldLeft = -offset.x / zoom;
    const worldTop = -offset.y / zoom;
    const worldRight = worldLeft + w / zoom;
    const worldBottom = worldTop + h / zoom;

    const rawWorldStep = basePixelGridSize / zoom; // in world units (cm)

    // Determine step (worldStep) based on selected display units
    // metric-mm: label units = mm; convert world cm -> mm
    // metric-cm: label units = cm; use world cm directly
    // imperial: label units = in; convert world cm -> inches
    let worldStep = 1; // in world units (cm)
    let formatLabel = (x: number) => formatRulerNumber(x * MM_PER_WORLD_UNIT); // default mm

    if (units === 'metric' && metricUnit === 'mm') {
      const rawLabelStep = rawWorldStep * MM_PER_WORLD_UNIT; // mm
      const labelStep = getStep(rawLabelStep);
      worldStep = labelStep / MM_PER_WORLD_UNIT;
      formatLabel = (x: number) => formatRulerNumber(x * MM_PER_WORLD_UNIT);
    } else if (units === 'metric' && metricUnit === 'cm') {
      const rawLabelStep = rawWorldStep; // cm
      const labelStep = getStep(rawLabelStep);
      worldStep = labelStep; // already cm
      formatLabel = (x: number) => formatRulerNumber(x);
    } else {
      // imperial (inches)
      const rawLabelStepIn = rawWorldStep / 2.54; // inches
      const labelStepIn = getStep(rawLabelStepIn);
      worldStep = labelStepIn * 2.54; // convert inches back to world cm
      formatLabel = (x: number) => formatRulerNumber(x / 2.54);
    }

    return { worldLeft, worldTop, worldRight, worldBottom, worldStep, formatLabel };
  }, [basePixelGridSize, height, offset.x, offset.y, width, zoom, metricUnit, units]);

  useEffect(() => {
    const topCanvas = topCanvasRef.current;
    const leftCanvas = leftCanvasRef.current;

    const dpr = window.devicePixelRatio || 1;

    // Compute sizes taking into account hidden rulers (expand to fill the space)
    const topWidth = Math.max(1, Math.floor(width + (showLeft ? 0 : rulerSize)));
    const topHeight = Math.max(1, Math.floor(rulerSize));
    const leftWidth = Math.max(1, Math.floor(rulerSize));
    const leftHeight = Math.max(1, Math.floor(height + (showTop ? 0 : rulerSize)));

    if (topCanvas && showTop) {
      topCanvas.width = Math.max(1, Math.floor(topWidth * dpr));
      topCanvas.height = Math.max(1, Math.floor(topHeight * dpr));
      topCanvas.style.width = `${topWidth}px`;
      topCanvas.style.height = `${topHeight}px`;
    }

    if (leftCanvas && showLeft) {
      leftCanvas.width = Math.max(1, Math.floor(leftWidth * dpr));
      leftCanvas.height = Math.max(1, Math.floor(leftHeight * dpr));
      leftCanvas.style.width = `${leftWidth}px`;
      leftCanvas.style.height = `${leftHeight}px`;
    }

    const topCtx = topCanvas && showTop ? topCanvas.getContext('2d') : null;
    const leftCtx = leftCanvas && showLeft ? leftCanvas.getContext('2d') : null;

    if (topCtx) topCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (leftCtx) leftCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Resolve themed colors from CSS variables
    const cs = getComputedStyle(document.documentElement);
    const panelOpaque = (cs.getPropertyValue('--panel-opaque') || '#ffffff').trim();
    const borderColor = (cs.getPropertyValue('--border') || '#ddd').trim();
    const textColor = (cs.getPropertyValue('--muted') || '#333').trim();

    // Clear + background
    if (topCtx) {
      topCtx.clearRect(0, 0, topWidth, topHeight);
      topCtx.fillStyle = panelOpaque;
      topCtx.fillRect(0, 0, topWidth, topHeight);
    }
    if (leftCtx) {
      leftCtx.clearRect(0, 0, leftWidth, leftHeight);
      leftCtx.fillStyle = panelOpaque;
      leftCtx.fillRect(0, 0, leftWidth, leftHeight);
    }

    // Styles
    if (topCtx) {
      topCtx.strokeStyle = borderColor;
      topCtx.fillStyle = textColor;
      topCtx.font = '11px sans-serif';
      topCtx.textAlign = 'center';
    }
    if (leftCtx) {
      leftCtx.strokeStyle = borderColor;
      leftCtx.fillStyle = textColor;
      leftCtx.font = '11px sans-serif';
      leftCtx.textAlign = 'right';
    }

    // Border lines
    if (topCtx) {
      topCtx.beginPath();
      topCtx.moveTo(0, topHeight - 0.5);
      topCtx.lineTo(topWidth, topHeight - 0.5);
      topCtx.stroke();
    }

    if (leftCtx) {
      leftCtx.beginPath();
      leftCtx.moveTo(leftWidth - 0.5, 0);
      leftCtx.lineTo(leftWidth - 0.5, leftHeight);
      leftCtx.stroke();
    }

    if (!viewport) return;

    const { worldLeft, worldTop, worldRight, worldBottom, worldStep } = viewport;

    const startX = Math.floor(worldLeft / worldStep) * worldStep;
    const endX = Math.ceil(worldRight / worldStep) * worldStep;
    const startY = Math.floor(worldTop / worldStep) * worldStep;
    const endY = Math.ceil(worldBottom / worldStep) * worldStep;

    // Top ruler labels (major ticks)
    let lastLabelX: number | null = null;
    let lastLabelXWidth = 0;
    const drawnLabelTextX = new Set<string>();

    if (topCtx) {
      for (let x = startX; x <= endX; x += worldStep) {
        const px = x * zoom + offset.x + (showLeft ? 0 : rulerSize);
        if (px < -50 || px > topWidth + 50) continue;

        const labelText = (viewport && viewport.formatLabel) ? viewport.formatLabel(x) : formatRulerNumber(x * MM_PER_WORLD_UNIT);
        if (drawnLabelTextX.has(labelText)) continue;
        const labelWidth = topCtx.measureText(labelText).width;
        const minGap = Math.max(minLabelSpacingPx, (lastLabelXWidth + labelWidth) / 2 + 6);

        const halfLabel = labelWidth / 2;
        if (px - halfLabel < 0 || px + halfLabel > topWidth) continue;
        if (lastLabelX !== null && Math.abs(px - lastLabelX) < minGap) continue;

        const y0 = topHeight;
        const y1 = y0 - 12;
        topCtx.beginPath();

        const subPixel = 0.5 / dpr - 1.5;
        topCtx.moveTo(px + subPixel, y0 - subPixel);
        topCtx.lineTo(px + subPixel, y1 + subPixel);
        topCtx.lineWidth = 1;
        topCtx.stroke();

        topCtx.fillText(labelText, px, topHeight / 2 + 3);
        lastLabelX = px;
        lastLabelXWidth = labelWidth;
        drawnLabelTextX.add(labelText);
      }
    }

    // Top ruler minor ticks
    if (worldStep / 2 > 0 && topCtx) {
      for (let x = startX; x <= endX; x += worldStep / 2) {
        const px = x * zoom + offset.x + (showLeft ? 0 : rulerSize);
        if (px < -50 || px > topWidth + 50) continue;
        topCtx.beginPath();
        const subPixel = 0.5 / dpr - 1.5;
        topCtx.moveTo(px + subPixel, topHeight);
        topCtx.lineTo(px + subPixel, topHeight - 6);
        topCtx.stroke();
      }
    }

    // Left ruler labels (major ticks)
    let lastLabelY: number | null = null;
    let lastLabelYHeight = 0;
    const drawnLabelTextY = new Set<string>();

    if (leftCtx) {
      for (let y = startY; y <= endY; y += worldStep) {
        const py = y * zoom + offset.y + (showTop ? 0 : rulerSize);
        if (py < -50 || py > leftHeight + 50) continue;

        const labelTextY = (viewport && viewport.formatLabel) ? viewport.formatLabel(y) : formatRulerNumber(y * MM_PER_WORLD_UNIT);
        if (drawnLabelTextY.has(labelTextY)) continue;

        const labelWidthY = leftCtx.measureText(labelTextY).width;
        const halfLabelY = labelWidthY / 2;
        if (py - halfLabelY < 0 || py + halfLabelY > leftHeight) continue;

        const minGapY = Math.max(minLabelSpacingPx, (lastLabelYHeight + labelWidthY) / 2 + 6);
        if (lastLabelY !== null && Math.abs(py - lastLabelY) < minGapY) continue;

        leftCtx.beginPath();
        const subPixel = 0.5 / dpr - 1.5;
        leftCtx.moveTo(leftWidth - subPixel, py + subPixel);
        leftCtx.lineTo(leftWidth - 12, py + subPixel);
        leftCtx.stroke();

        leftCtx.save();
        const xTranslate = leftWidth - 4;
        leftCtx.translate(xTranslate, py + 3);
        leftCtx.rotate(-Math.PI / 2);
        leftCtx.fillText(labelTextY, 0, 0);
        leftCtx.restore();

        lastLabelY = py;
        lastLabelYHeight = labelWidthY;
        drawnLabelTextY.add(labelTextY);
      }
    }

    // Left ruler minor ticks
    if (worldStep / 2 > 0 && leftCtx) {
      for (let y = startY; y <= endY; y += worldStep / 2) {
        const py = y * zoom + offset.y + (showTop ? 0 : rulerSize);
        if (py < -50 || py > leftHeight + 50) continue;
        leftCtx.beginPath();
        const subPixel = 0.5 / dpr - 1.5;
        leftCtx.moveTo(leftWidth, py + subPixel);
        leftCtx.lineTo(leftWidth - 6, py + subPixel);
        leftCtx.stroke();
      }
    }
  }, [basePixelGridSize, height, minLabelSpacingPx, offset.x, offset.y, rulerSize, viewport, width, zoom]);

  return (
    <>
      {showLeft && showTop && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: rulerSize,
            height: rulerSize,
            background: 'var(--panel-opaque)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            zIndex: 4500,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, userSelect: 'none' }}>
            {units === 'metric' ? metricUnit : 'in'}
          </div>
        </div>
      )}

      {showTop && (
        <canvas
          ref={topCanvasRef}
          style={{
            position: 'absolute',
            left: showLeft ? rulerSize : 0,
            top: 0,
            height: rulerSize,
            width: showLeft ? width : width + rulerSize,
            zIndex: 4500,
            pointerEvents: 'none',
          }}
        />
      )}

      {showLeft && (
        <canvas
          ref={leftCanvasRef}
          style={{
            position: 'absolute',
            left: 0,
            top: showTop ? rulerSize : 0,
            width: rulerSize,
            height: showTop ? height : height + rulerSize,
            zIndex: 4500,
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
}
