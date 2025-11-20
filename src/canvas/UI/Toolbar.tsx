import { useCanvasState } from '../state/CanvasState';
import { normalizeSegment, segmentsEqual } from '../state/utils';
import { importFromJson, exportToJson } from '../util/importExport';
import ZoomControls from './ZoomControls';
import { useState } from 'react';

export function Toolbar() {
  const { currentTool, setTool, setZoom, setOffset, zoom, offset, threeDEnabled, splitWidth } = useCanvasState();
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (folder: string) => {
    setOpenFolders(prev => {
      // If clicking the same folder, close it
      if (prev.has(folder)) {
        return new Set();
      }
      // Otherwise, open only this folder (close all others)
      return new Set([folder]);
    });
  };

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
      {/* Secondary toolbar - appears above when a folder is open */}
      {openFolders.size > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white rounded-lg p-2 shadow-lg flex items-center gap-2 z-[2001]">
          {openFolders.has('drawing') && (
            <>
              <button title='E - Pen' onClick={() => { setTool('pen'); setOpenFolders(new Set()); }} className="h-12 w-12 rounded-md p-2 cursor-pointer border-2" style={{ borderColor: currentTool === "pen" ? "#4781e6" : "transparent" }}>
                <img src='/svg/pen.svg' />
              </button>
            </>
          )}
          
          {openFolders.has('seaming') && (
            <>
              <button title='S - Seam' onClick={() => { setTool('seam'); setOpenFolders(new Set()); }} className="h-12 w-12 rounded-md p-2 cursor-pointer border-2" style={{ borderColor: currentTool === "seam" ? "#4781e6" : "transparent" }}>
                <img src='/svg/seam.svg' />
              </button>
              {currentTool === 'seam' && (
                <button
                  title='Delete seam'
                  onClick={() => {
                    const state = useCanvasState.getState();
                    const seamSelection = state.seamSelection;
                    const selectedSeg = state.selectedSeamSegment;
                    const seams = state.present.seams;
                    if (seamSelection && seamSelection.length === 2) {
                      state.removeSeam(seamSelection[0], seamSelection[1]);
                      state.setSeamSelection([]);
                      state.setSelectedSeamSegment(null);
                      return;
                    }
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
                  className="h-12 w-12 rounded-md p-2 cursor-pointer border-2 border-transparent hover:border-gray-300"
                >
                  <img src='/svg/delete.svg' />
                </button>
              )}
            </>
          )}
          
          {openFolders.has('styling') && (
            <>
              <label className="h-12 w-12 rounded-md p-2 cursor-pointer hover:bg-gray-100" title="Fill - Set Texture for Selected Paths">
                <img src='/svg/fill.svg' />
                <input type="file" accept="image/*" onChange={handleTextureImport} className="hidden" />
              </label>
              <button
                onClick={clearTexture}
                className="h-12 w-12 rounded-md p-2 cursor-pointer hover:bg-gray-100"
                title="Eraser - Clear Texture on Selected Paths"
              >
                <img src='/svg/eraser.svg' />
              </button>
            </>
          )}
          
          {openFolders.has('reference') && (
            <>
              <label className="h-12 w-12 rounded-md p-2 cursor-pointer hover:bg-gray-100" title="Image - Add Background Image">
                <img src='/svg/image.svg' />
                <input type="file" accept="image/*" onChange={handleImportImage} className="hidden" />
              </label>
              <button title='G - Background' onClick={() => { setTool('background'); setOpenFolders(new Set()); }} className="h-12 w-12 rounded-md p-2 cursor-pointer border-2" style={{ borderColor: currentTool === "background" ? "#4781e6" : "transparent" }}>
                <img src='/svg/background.svg' />
              </button>
            </>
          )}
          
          {openFolders.has('settings') && (
            <>
              <button 
                onClick={resetZoom} 
                className="h-12 w-12 rounded-md p-2 cursor-pointer hover:bg-gray-100" 
                title="Reset Zoom & View"
              >
                <img src='/svg/reset.svg' />
              </button>
              <button 
                onClick={() => useCanvasState.getState().resetCanvas()} 
                className="h-12 w-12 rounded-md p-2 cursor-pointer hover:bg-gray-100" 
                title="Clear Canvas"
              >
                <img src='/svg/delete.svg' />
              </button>
              <label className="h-12 w-12 rounded-md p-2 cursor-pointer hover:bg-gray-100" title="Import - Import JSON">
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
              <button onClick={exportToJson} className="h-12 w-12 rounded-md p-2 cursor-pointer hover:bg-gray-100" title="Export - Export JSON">
                <img src='/svg/import.svg' />
              </button>
            </>
          )}
        </div>
      )}

      {/* Main toolbar at bottom */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-lg p-2 shadow-lg flex items-center gap-2 z-[2000]">
        {/* Cursor - standalone */}
        <button title='W - Cursor' onClick={() => { setTool('select'); setOpenFolders(new Set()); }} className="h-12 w-12 rounded-md p-2 cursor-pointer border-2" style={{ borderColor: currentTool === "select" ? "#4781e6" : "transparent" }}>
          <img src='/svg/pointer.svg' />
        </button>

        <div className='w-[1px] h-8 bg-gray-300' />

        {/* Drawing Folder */}
        <button 
          title='Drawing Tools' 
          onClick={() => toggleFolder('drawing')}
          className="h-12 w-12 rounded-md p-2 cursor-pointer hover:bg-gray-100 relative"
          style={{ backgroundColor: openFolders.has('drawing') || currentTool === 'pen' ? '#f3f4f6' : 'transparent' }}
        >
          <img src='/svg/pen.svg' />
          <span className="absolute bottom-1 right-1 text-[10px] font-bold text-gray-600">
            ▼
          </span>
        </button>

        <div className='w-[1px] h-8 bg-gray-300' />

        {/* Seaming Folder */}
        <button 
          title='Seaming Tools' 
          onClick={() => toggleFolder('seaming')}
          className="h-12 w-12 rounded-md p-2 cursor-pointer hover:bg-gray-100 relative"
          style={{ backgroundColor: openFolders.has('seaming') || currentTool === 'seam' ? '#f3f4f6' : 'transparent' }}
        >
          <img src='/svg/seam.svg' />
          <span className="absolute bottom-1 right-1 text-[10px] font-bold text-gray-600">
            ▼
          </span>
        </button>

        <div className='w-[1px] h-8 bg-gray-300' />

        {/* Styling Folder */}
        <button 
          title='Styling Tools' 
          onClick={() => toggleFolder('styling')}
          className="h-12 w-12 rounded-md p-2 cursor-pointer hover:bg-gray-100 relative"
          style={{ backgroundColor: openFolders.has('styling') ? '#f3f4f6' : 'transparent' }}
        >
          <img src='/svg/color-bucket-com.svg' />
          <span className="absolute bottom-1 right-1 text-[10px] font-bold text-gray-600">
            ▼
          </span>
        </button>

        <div className='w-[1px] h-8 bg-gray-300' />

        {/* Reference Folder */}
        <button 
          title='Reference Tools' 
          onClick={() => toggleFolder('reference')}
          className="h-12 w-12 rounded-md p-2 cursor-pointer hover:bg-gray-100 relative"
          style={{ backgroundColor: openFolders.has('reference') || currentTool === 'background' ? '#f3f4f6' : 'transparent' }}
        >
          <img src='/svg/image.svg' />
          <span className="absolute bottom-1 right-1 text-[10px] font-bold text-gray-600">
            ▼
          </span>
        </button>

        <div className='w-[1px] h-8 bg-gray-300' />

        {/* Settings Folder */}
        <button 
          title='Settings' 
          onClick={() => toggleFolder('settings')}
          className="h-12 w-12 rounded-md p-2 cursor-pointer hover:bg-gray-100 relative"
          style={{ backgroundColor: openFolders.has('settings') ? '#f3f4f6' : 'transparent' }}
        >
          <img src='/svg/settings.svg' />
          <span className="absolute bottom-1 right-1 text-[10px] font-bold text-gray-600">
            ▼
          </span>
        </button>
      </div>

      <ZoomControls zoom={zoom} onZoomChange={handleZoomChange} />
    </>
  );
}
