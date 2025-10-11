import { useRef, useState } from 'react';
import Konva from 'konva';

import { useCanvasState } from './state/CanvasState';
import { ImageTransformPanel } from './UI/ImageTransformPanel';
import { ThreeDView } from './UI/ThreeDView';
import { Toolbar } from './UI/Toolbar';
import { CanvasStage } from './Stage/CanvasStage';
import { useStaticManImages } from './hooks/useStaticManImages';
import { useCanvasKeyboardShortcuts } from './hooks/useCanvasKeyboardShortcuts';
import { useSplitResize } from './hooks/useSplitResize';

Konva.showWarnings = false;

export function Canvas() {
  const stageRef = useRef<Konva.Stage>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const threeDEnabled = useCanvasState((state) => state.threeDEnabled);
  const toggle3D = useCanvasState((state) => state.toggle3D);
  const splitWidth = useCanvasState((state) => state.splitWidth);
  const setSplitWidth = useCanvasState((state) => state.setSplitWidth);
  const setIsSimulationMode = useCanvasState((state) => state.setIsSimulationMode);

  useStaticManImages();
  useCanvasKeyboardShortcuts({ setIsSpacePressed, isPanning, setIsPanning });

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

        <Toolbar />
      </div>
    </div>
  );
}
