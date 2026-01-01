import { useCallback, useEffect, useRef, useState } from 'react';

import { useCanvasState } from '../state/CanvasState';
import { normalizeSegment, segmentsEqual } from '../state/utils';
import type { Segment, SegmentPortion, Tool } from '../state/types';
import { BiomeshManModal } from './BiomeshManModal';
import { importFromJson, exportToJson, importFromDxf, exportToDxf } from '../utils/importExport';
import ZoomControls from './ZoomControls';
import Icon from './Icon';
// Icon handles SVG color substitution for dark-mode (#000 -> #fff)


function seamPartToSegment(part: Segment | SegmentPortion): Segment {
  return Array.isArray(part) ? part : part.segment;
}

function ToolbarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function ToolButton({
  tool,
  currentTool,
  onClick,
  title,
  iconSrc,
  hotkey,
}: {
  tool: Tool;
  currentTool: Tool;
  onClick: () => void;
  title: string;
  iconSrc: string;
  hotkey?: string;
}) {
  const isActive = currentTool === tool;
  const fullTitle = hotkey ? `${title} (${hotkey})` : title;
  return (
    <button
      type="button"
      aria-label={fullTitle}
      aria-pressed={isActive}
      title={fullTitle}
      onClick={onClick}
      className={
        "h-10 w-10 rounded-md p-1 border-2 transition-colors " +
        (isActive
          ? "border-blue-500/60 bg-blue-50"
          : "border-transparent bg-white hover:border-gray-200")
      }
    >
      <Icon src={iconSrc} className="h-full w-full" />
    </button>
  );
}

function ActionButton({
  onClick,
  title,
  iconSrc,
  tone = 'neutral',
  active = false,
  disabled,
}: {
  onClick: () => void;
  title: string;
  iconSrc: string;
  tone?: 'neutral' | 'danger';
  active?: boolean;
  disabled?: boolean;
}) {
  const base =
    'h-10 w-10 rounded-md p-1 border-2 transition-colors bg-white hover:border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed';
  const toneCls =
    tone === 'danger'
      ? (active ? 'border-red-400 hover:border-red-500 bg-red-50' : 'border-transparent')
      : 'border-transparent';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${toneCls}`}
    >
      <Icon src={iconSrc} className="h-full w-full" />
    </button>
  );
}

function FileMenuItem({
  title,
  description,
  iconSrc,
  onClick,
}: {
  title: string;
  description?: string;
  iconSrc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-gray-50"
      title={title}
    >
      <Icon src={iconSrc} className="h-5 w-5 mt-0.5" />
      <div className="flex flex-col">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        {description ? <div className="text-xs text-gray-500">{description}</div> : null}
      </div>
    </button>
  );
}

export function Toolbar({ onResetView, defaultZoom }: { onResetView?: () => void; defaultZoom?: number }) {
  const { currentTool, setTool, setZoom, setOffset, zoom } = useCanvasState();
  const seamDeleteMode = useCanvasState((state) => state.seamDeleteMode);
  const [isManModalOpen, setIsManModalOpen] = useState(false);

  const fileInputImageRef = useRef<HTMLInputElement | null>(null);
  const fileInputJsonRef = useRef<HTMLInputElement | null>(null);
  const fileInputDxfRef = useRef<HTMLInputElement | null>(null);
  const fileInputTextureRef = useRef<HTMLInputElement | null>(null);

  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!fileMenuOpen) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const el = fileMenuRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setFileMenuOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFileMenuOpen(false);
    };

    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [fileMenuOpen]);

  const handleImportImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          const id = crypto.randomUUID();
          useCanvasState.getState().addBackgroundImage(reader.result as string, id);
          // Always place newly imported background images at the origin.
          useCanvasState.getState().moveBackgroundImage(id, 0, 0);
          useCanvasState.getState().setTool('background');
          useCanvasState.getState().selectBackgroundImage(id);

          useCanvasState.getState().deselectPoint();
          useCanvasState.getState().clearSelectedPointIds();
        }
      };
      reader.readAsDataURL(file);
      // reset input so selecting the same file again triggers change event
      try { e.currentTarget.value = ''; } catch { /* ignore */ }
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

      // UX: after choosing a texture, switch to Texture tool so users can immediately position it.
      useCanvasState.getState().setTool('texture');
    };
    reader.readAsDataURL(file);
    // reset value so re-selecting the same file triggers change event
    e.currentTarget.value = '';
  };

  const hasSelectedPoints = useCanvasState((s) => s.selectedPointIds.length > 0);

  const openFilePicker = useCallback((ref: React.RefObject<HTMLInputElement | null>) => {
    const el = ref.current;
    if (!el) return;
    el.click();
  }, []);

  const handleZoomChange = (value: number) => {
    setZoom(value);
  };

  const resetZoom = () => {
    if (onResetView) {
      onResetView();
      return;
    }

    const viewportEl = (typeof document !== 'undefined')
      ? (document.querySelector('[data-canvas-viewport="true"]') as HTMLElement | null)
      : null;
    const rect = viewportEl?.getBoundingClientRect();
    const vpWidth = rect?.width ? Math.max(0, rect.width) : window.innerWidth;
    const vpHeight = rect?.height ? Math.max(0, rect.height) : window.innerHeight;

    const nextZoom = (typeof defaultZoom === 'number' && Number.isFinite(defaultZoom) && defaultZoom > 0) ? defaultZoom : 1;
    setZoom(nextZoom);
    setOffset({
      x: vpWidth / 2,
      y: vpHeight / 2,
    });
  };

  return (
    <>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-[2000]">
        <div className="bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg flex flex-col gap-4 border border-gray-200">
          <ToolbarSection title="Pattern">
            <ToolButton tool="select" currentTool={currentTool} onClick={() => setTool('select')} title="Select" iconSrc="/svg/pointer.svg" hotkey="W" />
            <ToolButton tool="pen" currentTool={currentTool} onClick={() => setTool('pen')} title="Pen" iconSrc="/svg/pen.svg" hotkey="E" />
          </ToolbarSection>

          <ToolbarSection title="Seams">
            <ToolButton tool="seam" currentTool={currentTool} onClick={() => setTool('seam')} title="Seam" iconSrc="/svg/seam.svg" hotkey="S" />
            <ActionButton
              title={seamDeleteMode ? 'Seam delete mode: ON' : 'Delete seam'}
              iconSrc="/svg/delete.svg"
              tone="danger"
              active={seamDeleteMode}
              disabled={currentTool !== 'seam'}
              onClick={() => {
                const state = useCanvasState.getState();
                const seamSelection = state.seamSelection;
                const selectedSeg = state.selectedSeamSegment;
                const seams = state.present.seams;

                // If two segments are selected (candidate seam), remove that seam.
                if (seamSelection && seamSelection.length === 2) {
                  state.removeSeam(seamSelection[0], seamSelection[1]);
                  state.setSeamSelection([]);
                  state.setSelectedSeamSegment(null);
                  state.setSeamDeleteMode(false);
                  return;
                }

                // Otherwise, if the cursor-hovered segment is part of a seam, remove that seam.
                if (selectedSeg) {
                  const target = normalizeSegment(selectedSeg);
                  for (const s of seams) {
                    const [a, b] = s;
                    const na = normalizeSegment(seamPartToSegment(a));
                    const nb = normalizeSegment(seamPartToSegment(b));
                    if (segmentsEqual(na, target) || segmentsEqual(nb, target)) {
                      state.removeSeam(seamPartToSegment(a), seamPartToSegment(b));
                      state.setSeamSelection([]);
                      state.setSelectedSeamSegment(null);
                      state.setSeamDeleteMode(false);
                      return;
                    }
                  }
                }

                // No seam directly selected; arm delete mode so the next seam click removes it.
                state.setSeamDeleteMode(!state.seamDeleteMode);
              }}
            />
          </ToolbarSection>

          <ToolbarSection title="Texture">
            <ToolButton tool="texture" currentTool={currentTool} onClick={() => setTool('texture')} title="Texture tool" iconSrc="/svg/fill.svg" hotkey="T" />
            <ActionButton
              title="Apply texture to selected"
              iconSrc="/svg/image.svg"
              disabled={!hasSelectedPoints}
              onClick={() => openFilePicker(fileInputTextureRef)}
            />
            <div />
            <div />
          </ToolbarSection>

          <ToolbarSection title="Background">
            <ToolButton tool="background" currentTool={currentTool} onClick={() => setTool('background')} title="Background" iconSrc="/svg/background.svg" hotkey="G" />
            <ActionButton
              title="Import background image"
              iconSrc="/svg/image.svg"
              onClick={() => openFilePicker(fileInputImageRef)}
            />
            <ActionButton title="Generate Man Background" iconSrc="/svg/human.svg" onClick={() => setIsManModalOpen(true)} />
            <div />
          </ToolbarSection>

          <div className="flex flex-col gap-2">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Import / Export</div>
            <div ref={fileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setFileMenuOpen((v) => !v)}
                className={
                  'w-full flex items-center justify-center gap-2 rounded-md border-2 px-2 py-2 text-sm font-medium transition-colors ' +
                  (fileMenuOpen ? 'border-blue-500/60 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300')
                }
                aria-haspopup="menu"
                aria-expanded={fileMenuOpen}
                title="Open import/export menu"
              >
                <Icon src="/svg/export.svg" className="h-5 w-5" />
                <span className="text-gray-900">File</span>
              </button>

              {fileMenuOpen && (
                <div className="absolute right-full bottom-0 mr-3 w-72 rounded-xl border border-gray-200 bg-white shadow-lg p-2">
                  <div className="px-2 pb-2 text-xs text-gray-500">Patterns + seams + textures</div>
                  <div className="flex flex-col">
                    <FileMenuItem
                      title="Import JSON"
                      description="Load patterns + seams + textures"
                      iconSrc="/svg/import.svg"
                      onClick={() => {
                        setFileMenuOpen(false);
                        openFilePicker(fileInputJsonRef);
                      }}
                    />
                    <FileMenuItem
                      title="Export JSON"
                      description="Save patterns + seams + textures"
                      iconSrc="/svg/export.svg"
                      onClick={() => {
                        setFileMenuOpen(false);
                        exportToJson();
                      }}
                    />

                    <div className="my-2 h-px w-full bg-gray-200" />

                    <FileMenuItem
                      title="Import DXF"
                      description="Load industry-standard DXF"
                      iconSrc="/svg/import.svg"
                      onClick={() => {
                        setFileMenuOpen(false);
                        openFilePicker(fileInputDxfRef);
                      }}
                    />
                    <FileMenuItem
                      title="Export DXF"
                      description="Export industry-standard DXF"
                      iconSrc="/svg/export.svg"
                      onClick={() => {
                        setFileMenuOpen(false);
                        exportToDxf();
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Hidden file inputs controlled by buttons/menu */}
          <input
            ref={fileInputImageRef}
            type="file"
            accept="image/*"
            onChange={handleImportImage}
            className="hidden"
          />
          <input
            ref={fileInputJsonRef}
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importFromJson(file);
              // reset so selecting same file triggers change
              try {
                e.currentTarget.value = '';
              } catch {
                // ignore
              }
            }}
            className="hidden"
          />
          <input
            ref={fileInputDxfRef}
            type="file"
            accept=".dxf,text/plain,application/dxf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importFromDxf(file);
              try {
                e.currentTarget.value = '';
              } catch {
                // ignore
              }
            }}
            className="hidden"
          />
          <input
            ref={fileInputTextureRef}
            type="file"
            accept="image/*"
            onChange={handleTextureImport}
            className="hidden"
          />
        </div>
      </div>

      <ZoomControls zoom={zoom} baseZoom={defaultZoom} onZoomChange={handleZoomChange} onReset={resetZoom} />

      <BiomeshManModal open={isManModalOpen} onClose={() => setIsManModalOpen(false)} />
    </>
  );
}
