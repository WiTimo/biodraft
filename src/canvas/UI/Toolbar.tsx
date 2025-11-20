import { useCanvasState } from '../state/CanvasState';
import { normalizeSegment, segmentsEqual } from '../state/utils';
import { importFromJson, exportToJson } from '../util/importExport';
import ZoomControls from './ZoomControls';

export function Toolbar() {
  const { currentTool, setTool, setZoom, setOffset, zoom, offset, threeDEnabled, splitWidth } = useCanvasState();

  const handleImportImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          const id = crypto.randomUUID();
          useCanvasState.getState().addBackgroundImage(reader.result as string, id);
          const img = new Image();
          img.src = reader.result as string;
          img.onload = () => {
            const width = img.width;
            const height = img.height;
            useCanvasState.getState().moveBackgroundImage(id, window.innerWidth / 2 - width / 2, window.innerHeight / 2 - height / 2);
          };
          useCanvasState.getState().setTool('background');
          useCanvasState.getState().selectBackgroundImage(id);

          useCanvasState.getState().deselectPoint();
          useCanvasState.getState().clearSelectedPointIds();
        }
      };
      reader.readAsDataURL(file);
      // reset input so selecting the same file again triggers change event
      try { e.currentTarget.value = ''; } catch (e) { /* ignore */ }
    }
  };

  const handleTextureImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // apply to all paths that contain any selected points
      useCanvasState.getState().setTextureForSelectedPaths({
        src: dataUrl,
        scaleX: 1,
        scaleY: 1,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        repeat: 'repeat',
      });
    };
    reader.readAsDataURL(file);
    // reset value so re-selecting the same file triggers change event
    e.currentTarget.value = '';
  };

  const clearTexture = () => {
    // apply null texture to all selected paths
    useCanvasState.getState().setTextureForSelectedPaths(null);
  };

  const handleZoomChange = (value: number) => {
    // Calculate the center of the viewport in world coordinates
    const canvasWidth = threeDEnabled ? (window.innerWidth - splitWidth) : window.innerWidth;
    const canvasHeight = window.innerHeight;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    // Current world position at center
    const worldCenterX = (centerX - offset.x) / zoom;
    const worldCenterY = (centerY - offset.y) / zoom;
    
    // Calculate new offset to keep the same world point at center
    const newOffset = {
      x: centerX - worldCenterX * value,
      y: centerY - worldCenterY * value,
    };
    
    setZoom(value);
    setOffset(newOffset);
  };

  const resetZoom = () => {
    // Reset zoom and center on x=0 (the dividing line)
    const canvasWidth = threeDEnabled ? (window.innerWidth - splitWidth) : window.innerWidth;
    const canvasHeight = window.innerHeight;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    setZoom(1);
    setOffset({
      x: centerX,
      y: centerY - 400, // 400 is the approximate center y of the canvas content
    });
  };

  return (
    <>
      <div
        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white rounded-md p-2 shadow-lg flex flex-col gap-2 z-[2000]"
      >
        <button title='W' onClick={() => setTool('select')} className="h-10 w-10 rounded-md p-1 cursor-pointer border-white border-4" style={{ borderColor: currentTool === "select" ? "#4781e688" : "white" }}>
          <img src='/svg/pointer.svg' />
        </button>
        <button title='E' onClick={() => setTool('pen')} className="h-10 w-10 rounded-md p-1 cursor-pointer border-white border-4" style={{ borderColor: currentTool === "pen" ? "#4781e688" : "white" }}>
          <img src='/svg/pen.svg' />
        </button>
        <button title='S' onClick={() => setTool('seam')} className="h-10 w-10 rounded-md p-1 cursor-pointer border-white border-4" style={{ borderColor: currentTool === "seam" ? "#4781e688" : "white" }}>
          <img src='/svg/seam.svg' />
        </button>
        {/* Delete seam button - only show when seam tool is active */}
        {currentTool === 'seam' && (
          <button
            title='Delete seam'
            onClick={() => {
              const state = useCanvasState.getState();
              const seamSelection = state.seamSelection;
              const selectedSeg = state.selectedSeamSegment;
              const seams = state.present.seams;
              // if two segments are selected (candidate seam), remove that seam
              if (seamSelection && seamSelection.length === 2) {
                state.removeSeam(seamSelection[0], seamSelection[1]);
                state.setSeamSelection([]);
                state.setSelectedSeamSegment(null);
                return;
              }

              // otherwise, if the cursor-hovered segment is part of a seam, remove that seam
              if (selectedSeg) {
                const target = normalizeSegment(selectedSeg as any);
                for (const s of seams) {
                  const [a, b] = s;
                  const na = normalizeSegment(a as any);
                  const nb = normalizeSegment(b as any);
                  if (segmentsEqual(na as any, target as any) || segmentsEqual(nb as any, target as any)) {
                    state.removeSeam(s[0], s[1]);
                    state.setSeamSelection([]);
                    state.setSelectedSeamSegment(null);
                    return;
                  }
                }
              }
            }}
            className="h-10 w-10 rounded-md p-1 cursor-pointer border-white border-4"
            style={{ borderColor: 'white' }}
          >
            <img src='/svg/delete.svg' />
          </button>
        )}
        <button title='G' onClick={() => setTool('background')} className="h-10 w-10 rounded-md p-1 cursor-pointer border-white border-4" style={{ borderColor: currentTool === "background" ? "#4781e688" : "white" }}>
          <img src='/svg/background.svg' />
        </button>

        <div className='h-[1px] w-full mt-2 mb-2 bg-gray-600 rounded-full' />

        {/* Background image import */}
        <label className="h-10 w-10 rounded-md p-1 cursor-pointer" title="Add Background Image">
          <img src='/svg/image.svg' />
          <input type="file" accept="image/*" onChange={handleImportImage} className="hidden" />
        </label>

        {/* JSON import (patterns+seams+textures) */}
        <label className="h-10 w-10 rounded-md p-1 cursor-pointer" title="Import JSON">
          <img src='/svg/export.svg' />
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importFromJson(file);
            }}
            className="hidden"
          />
        </label>

        {/* JSON export */}
        <button onClick={exportToJson} className="border-none h-10 w-10 rounded-md p-1 cursor-pointer" title="Export JSON">
          <img src='/svg/import.svg' />
        </button>

        <div className='h-[1px] w-full mt-2 mb-2 bg-gray-600 rounded-full' />

        {/* ▶️ Texture: apply to selected paths */}
        <label className="h-10 w-10 rounded-md p-1 cursor-pointer" title="Set Texture for Selected Paths">
          <img src='/svg/fill.svg' />
          <input type="file" accept="image/*" onChange={handleTextureImport} className="hidden" />
        </label>

        <button
          onClick={clearTexture}
          className="h-10 w-10 rounded-md p-1 cursor-pointer"
          title="Clear Texture on Selected Paths"
        >
          <img src='/svg/eraser.svg' />
        </button>
      </div>

      <ZoomControls zoom={zoom} onZoomChange={handleZoomChange} onReset={resetZoom} />
    </>
  );
}
