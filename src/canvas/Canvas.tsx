import { useRef, useState, useEffect } from 'react';
import Konva from 'konva';

import { useCanvasState } from './state/CanvasState';
import { ImageTransformPanel } from './UI/ImageTransformPanel';
import { ThreeDView } from './UI/ThreeDView';
import { Toolbar } from './UI/Toolbar';
import { CanvasStage } from './Stage/CanvasStage';
import SelectionToolbarOverlay from './Layers/SelectionToolbarOverlay';
import { useStaticManImages } from './hooks/useStaticManImages';
import { useCanvasKeyboardShortcuts } from './hooks/useCanvasKeyboardShortcuts';
import { useSplitResize } from './hooks/useSplitResize';

Konva.showWarnings = false;

export function Canvas() {
  const stageRef = useRef<Konva.Stage>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [initialCenterDone, setInitialCenterDone] = useState(false);

  const threeDEnabled = useCanvasState((state) => state.threeDEnabled);
  const toggle3D = useCanvasState((state) => state.toggle3D);
  const splitWidth = useCanvasState((state) => state.splitWidth);
  const setSplitWidth = useCanvasState((state) => state.setSplitWidth);
  const setIsSimulationMode = useCanvasState((state) => state.setIsSimulationMode);
  const frontCollapsed = useCanvasState((state) => state.frontCollapsed);
  const backCollapsed = useCanvasState((state) => state.backCollapsed);
  const toggleFrontCollapse = useCanvasState((state) => state.toggleFrontCollapse);
  const toggleBackCollapse = useCanvasState((state) => state.toggleBackCollapse);
  const setOffset = useCanvasState((state) => state.setOffset);
  const zoom = useCanvasState((state) => state.zoom);
  const manImageCenters = useCanvasState((state) => state.manImageCenters);

  useStaticManImages();
  useCanvasKeyboardShortcuts({ setIsSpacePressed, isPanning, setIsPanning });

  // Helper to center viewport on a specific world coordinate
  const centerViewportOn = (worldX: number, worldY: number) => {
    // Calculate the actual canvas width (excluding 3D panel if open)
    const canvasWidth = threeDEnabled ? (window.innerWidth - splitWidth) : window.innerWidth;
    const windowCenterX = canvasWidth / 2;
    const windowCenterY = window.innerHeight / 2;
    setOffset({
      x: windowCenterX - worldX * zoom,
      y: windowCenterY - worldY * zoom,
    });
  };

  // Initial centering on the dividing line when both sections are visible
  useEffect(() => {
    if (!initialCenterDone && Object.keys(manImageCenters).length > 0) {
      if (!frontCollapsed && !backCollapsed) {
        centerViewportOn(700, 400);
      }
      setInitialCenterDone(true);
    }
  }, [manImageCenters, frontCollapsed, backCollapsed, initialCenterDone, threeDEnabled, splitWidth, zoom, centerViewportOn]);

  const { isResizing, startResize } = useSplitResize({ setSplitWidth, setIsSimulationMode });

  const stageContainerStyle = {
    flex: 1,
    width: threeDEnabled ? window.innerWidth - splitWidth : '100%',
    borderTopLeftRadius: threeDEnabled ? '1rem' : 0,
    borderBottomLeftRadius: threeDEnabled ? '1rem' : 0,
  } as const;

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
        <CanvasStage
          stageRef={stageRef}
          isSpacePressed={isSpacePressed}
          isPanning={isPanning}
          setIsPanning={setIsPanning}
        />
        {/* DOM overlay toolbar for selection transforms */}
        <SelectionToolbarOverlay />

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

        {/* Front/Back collapse buttons */}
        <div style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 5000,
          display: 'flex',
          gap: '8px',
        }}>
          <button
            onClick={() => {
              toggleFrontCollapse();
              if (!frontCollapsed) {
                // Collapsing front: center on back man image
                const backCenter = manImageCenters['static-man-back'];
                if (backCenter) {
                  centerViewportOn(backCenter.x, backCenter.y);
                }
              } else {
                // Expanding front: center on dividing line (x=700)
                centerViewportOn(700, 400);
              }
            }}
            style={{
              padding: '8px 16px',
              borderWidth: 2,
              borderStyle: 'solid',
              borderColor: frontCollapsed ? '#888' : '#4781e6',
              borderRadius: 6,
              cursor: 'pointer',
              backgroundColor: 'white',
              fontWeight: 600,
              fontSize: '14px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
            title={frontCollapsed ? 'Show Front' : 'Hide Front'}
          >
            {frontCollapsed ? '◀ Front' : 'Front ▶'}
          </button>
          <button
            onClick={() => {
              toggleBackCollapse();
              if (!backCollapsed) {
                // Collapsing back: center on front man image
                const frontCenter = manImageCenters['static-man'];
                if (frontCenter) {
                  centerViewportOn(frontCenter.x, frontCenter.y);
                }
              } else {
                // Expanding back: center on dividing line (x=700)
                centerViewportOn(700, 400);
              }
            }}
            style={{
              padding: '8px 16px',
              borderWidth: 2,
              borderStyle: 'solid',
              borderColor: backCollapsed ? '#888' : '#4781e6',
              borderRadius: 6,
              cursor: 'pointer',
              backgroundColor: 'white',
              fontWeight: 600,
              fontSize: '14px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
            title={backCollapsed ? 'Show Back' : 'Hide Back'}
          >
            {backCollapsed ? 'Back ▶' : '◀ Back'}
          </button>
        </div>

        <Toolbar />
      </div>
    </div>
  );
}
