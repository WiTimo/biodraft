import { useEffect, useMemo, useRef } from 'react';

import { formatRulerNumber, getStep } from '../util/grid';

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
}: {
  width: number;
  height: number;
  zoom: number;
  offset: { x: number; y: number };
  rulerSize?: number;
  basePixelGridSize?: number;
  minLabelSpacingPx?: number;
}) {
  const topCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

    const rawWorldStep = basePixelGridSize / zoom;
    const worldStep = getStep(rawWorldStep);

    return { worldLeft, worldTop, worldRight, worldBottom, worldStep };
  }, [basePixelGridSize, height, offset.x, offset.y, width, zoom]);

  useEffect(() => {
    const topCanvas = topCanvasRef.current;
    const leftCanvas = leftCanvasRef.current;
    if (!topCanvas || !leftCanvas) return;

    const dpr = window.devicePixelRatio || 1;

    const topWidth = Math.max(1, Math.floor(width));
    const topHeight = Math.max(1, Math.floor(rulerSize));
    topCanvas.width = Math.max(1, Math.floor(topWidth * dpr));
    topCanvas.height = Math.max(1, Math.floor(topHeight * dpr));
    topCanvas.style.width = `${topWidth}px`;
    topCanvas.style.height = `${topHeight}px`;

    const leftWidth = Math.max(1, Math.floor(rulerSize));
    const leftHeight = Math.max(1, Math.floor(height));
    leftCanvas.width = Math.max(1, Math.floor(leftWidth * dpr));
    leftCanvas.height = Math.max(1, Math.floor(leftHeight * dpr));
    leftCanvas.style.width = `${leftWidth}px`;
    leftCanvas.style.height = `${leftHeight}px`;

    const topCtx = topCanvas.getContext('2d');
    const leftCtx = leftCanvas.getContext('2d');
    if (!topCtx || !leftCtx) return;

    topCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    leftCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear + background
    topCtx.clearRect(0, 0, topWidth, topHeight);
    leftCtx.clearRect(0, 0, leftWidth, leftHeight);

    topCtx.fillStyle = '#ffffff';
    leftCtx.fillStyle = '#ffffff';
    topCtx.fillRect(0, 0, topWidth, topHeight);
    leftCtx.fillRect(0, 0, leftWidth, leftHeight);

    // Styles
    topCtx.strokeStyle = '#ddd';
    leftCtx.strokeStyle = '#ddd';
    topCtx.fillStyle = '#333';
    leftCtx.fillStyle = '#333';
    topCtx.font = '11px sans-serif';
    leftCtx.font = '11px sans-serif';
    topCtx.textAlign = 'center';
    leftCtx.textAlign = 'right';

    // Border lines
    topCtx.beginPath();
    topCtx.moveTo(0, topHeight - 0.5);
    topCtx.lineTo(topWidth, topHeight - 0.5);
    topCtx.stroke();

    leftCtx.beginPath();
    leftCtx.moveTo(leftWidth - 0.5, 0);
    leftCtx.lineTo(leftWidth - 0.5, leftHeight);
    leftCtx.stroke();

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

    for (let x = startX; x <= endX; x += worldStep) {
      const px = x * zoom + offset.x;
      if (px < -50 || px > topWidth + 50) continue;

      const labelText = formatRulerNumber(x);
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

    // Top ruler minor ticks
    if (worldStep / 2 > 0) {
      for (let x = startX; x <= endX; x += worldStep / 2) {
        const px = x * zoom + offset.x;
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

    for (let y = startY; y <= endY; y += worldStep) {
      const py = y * zoom + offset.y;
      if (py < -50 || py > leftHeight + 50) continue;

      const labelTextY = formatRulerNumber(y);
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

    // Left ruler minor ticks
    if (worldStep / 2 > 0) {
      for (let y = startY; y <= endY; y += worldStep / 2) {
        const py = y * zoom + offset.y;
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
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: rulerSize,
          height: rulerSize,
          background: '#ffffff',
          borderRight: '1px solid #ddd',
          borderBottom: '1px solid #ddd',
          zIndex: 4500,
          pointerEvents: 'none',
        }}
      />

      <canvas
        ref={topCanvasRef}
        style={{
          position: 'absolute',
          left: rulerSize,
          top: 0,
          height: rulerSize,
          width: width,
          zIndex: 4500,
          pointerEvents: 'none',
        }}
      />

      <canvas
        ref={leftCanvasRef}
        style={{
          position: 'absolute',
          left: 0,
          top: rulerSize,
          width: rulerSize,
          height: height,
          zIndex: 4500,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
