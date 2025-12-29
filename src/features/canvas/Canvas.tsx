import { useLayoutEffect, useRef, useState } from 'react';
import Konva from 'konva';

import { useCanvasState } from './state/CanvasState';
import { ImageTransformPanel } from './UI/ImageTransformPanel';
import { ThreeDView } from './UI/ThreeDView';
import { Toolbar } from './UI/Toolbar';
import { CanvasStage } from './Stage/CanvasStage';

import { useStaticManImages } from './hooks/useStaticManImages';
import { useCanvasKeyboardShortcuts } from './hooks/useCanvasKeyboardShortcuts';
import { useSplitResize } from './hooks/useSplitResize';
import { RulersOverlay } from './UI/RulersOverlay';

const RULER_SIZE = 24;

Konva.showWarnings = false;

export function Canvas() {
  const stageRef = useRef<Konva.Stage>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const threeDEnabled = useCanvasState((state) => state.threeDEnabled);
  const toggle3D = useCanvasState((state) => state.toggle3D);
  const splitWidth = useCanvasState((state) => state.splitWidth);
  const setSplitWidth = useCanvasState((state) => state.setSplitWidth);
  const setIsSimulationMode = useCanvasState((state) => state.setIsSimulationMode);
  const zoom = useCanvasState((state) => state.zoom);
  const offset = useCanvasState((state) => state.offset);

  useStaticManImages();
  useCanvasKeyboardShortcuts({ setIsSpacePressed, isPanning, setIsPanning });

  const { isResizing, startResize } = useSplitResize({ setSplitWidth, setIsSimulationMode });

  const stageContainerStyle = {
    flex: 1,
    width: threeDEnabled ? window.innerWidth - splitWidth : '100%',
    borderTopLeftRadius: threeDEnabled ? '1rem' : 0,
    borderBottomLeftRadius: threeDEnabled ? '1rem' : 0,
  } as const;

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setViewportSize({ width: Math.max(0, Math.floor(rect.width)), height: Math.max(0, Math.floor(rect.height)) });
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [threeDEnabled, splitWidth]);

  // Center view on man images once at startup (when manImageCenters is set)
  const manImageCenters = useCanvasState((s) => s.manImageCenters);
  const setZoom = useCanvasState((s) => s.setZoom);
  const setOffset = useCanvasState((s) => s.setOffset);
  const initialCentered = useRef(false);

  useLayoutEffect(() => {
    if (initialCentered.current) return;
    const centers = Object.values(manImageCenters || {}) as Array<{ x: number; y: number }>;
    if (centers.length === 0) return;
    if (viewportSize.width === 0 || viewportSize.height === 0) return;

    const avg = centers.reduce((acc, c) => ({ x: acc.x + c.x, y: acc.y + c.y }), { x: 0, y: 0 } as { x: number; y: number });
    avg.x /= centers.length;
    avg.y /= centers.length;

    setZoom(1);
    setOffset({ x: viewportSize.width / 2 - avg.x * 1, y: viewportSize.height / 2 - avg.y * 1 });
    initialCentered.current = true;
  }, [manImageCenters, viewportSize.width, viewportSize.height, setOffset, setZoom]);

  return (
    <div className="w-full h-full flex">
      {threeDEnabled && (
        isResizing ? (
          <div className="h-full grid place-items-center overflow-hidden rounded-r-2xl bg-black" style={{ width: splitWidth }}>
            <img src="/svg/loader.svg" className="h-14 w-14 select-none" />
          </div>
        ) : (
          <div className="h-full overflow-hidden rounded-r-2xl" style={{ width: splitWidth }}>
            <ThreeDView />
          </div>
        )
      )}

      {threeDEnabled && (
        <div
          onMouseDown={startResize}
          className="h-full relative z-10"
          style={{ width: 10, cursor: 'col-resize' }}
        />
      )}

      <div className="h-full relative overflow-hidden" style={stageContainerStyle}>
        <ImageTransformPanel />

        <div className="absolute inset-0" style={{ background: '#ffffff' }}>
          {/* Rulers overlay */}
          <RulersOverlay
            width={Math.max(0, viewportSize.width)}
            height={Math.max(0, viewportSize.height)}
            zoom={zoom}
            offset={offset}
            rulerSize={RULER_SIZE}
          />

          {/* Stage viewport (space excluding rulers) */}
          <div
            ref={viewportRef}
            style={{
              position: 'absolute',
              left: RULER_SIZE,
              top: RULER_SIZE,
              right: 0,
              bottom: 0,
              overflow: 'hidden',
            }}
          >
            <CanvasStage
              stageRef={stageRef}
              isSpacePressed={isSpacePressed}
              isPanning={isPanning}
              setIsPanning={setIsPanning}
              width={viewportSize.width}
              height={viewportSize.height}
            />
          </div>
        </div>


        <button
          onClick={toggle3D}
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 5000,
            padding: '6px 12px',
            borderWidth: 3,
            borderStyle: 'solid',
            borderColor: threeDEnabled ? '#4781e6' : '#ddd',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          <img src="/svg/toggle3d.svg" className="h-10 w-10" />
        </button>

        <Toolbar onResetView={() => {
          // Reset zoom and center view on the man images (averaged center)
          const state = useCanvasState.getState();
          const { manImageCenters } = state;

          // Reset zoom to 1 first
          state.setZoom(1);

          const centers = Object.values(manImageCenters || {}) as Array<{ x: number; y: number }>;
          if (centers.length === 0) {
            state.setOffset({ x: 0, y: 0 });
            return;
          }

          const avg = centers.reduce((acc, c) => ({ x: acc.x + c.x, y: acc.y + c.y }), { x: 0, y: 0 } as { x: number; y: number });
          avg.x /= centers.length;
          avg.y /= centers.length;

          // viewport dimensions (inside rulers)
          const vpWidth = Math.max(0, viewportSize.width);
          const vpHeight = Math.max(0, viewportSize.height);

          // Compute offset so that avg world coordinate is centered in the viewport
          state.setOffset({
            x: vpWidth / 2 - avg.x * 1,
            y: vpHeight / 2 - avg.y * 1,
          });
        }} />
      </div>
    </div>
  );
}
