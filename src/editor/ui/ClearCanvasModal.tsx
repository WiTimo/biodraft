import { useEffect, useRef, useState } from 'react';
import { useCanvasState } from '../state/CanvasState';
import { applyManImagesToCanvas } from '../hooks/useStaticManImages';
import { dataUrlToBlobUrl, storeBiomeshManImages } from '../utils/biomeshManImages';

const SERVER_URL = (import.meta as any).env?.VITE_BIOMESH_RENDER_SERVER_URL ?? '';

const ERROR_MSG = "Could not connect to the render server. Our Team currently investigating what is causing this issue. Please try again later.";

function sanitizeStatusMessage(raw: string) {
  const msg = String(raw || '').trim();
  if (!msg) return '';

  const lowered = msg.toLowerCase();
  if (lowered.includes('validating')) return 'Preparing…';
  if (lowered.includes('generating model')) return 'Generating model…';
  if (lowered.includes('requesting')) return 'Generating model…';
  if (lowered.includes('downloading')) return 'Downloading model…';
  if (lowered.includes('preparing render') || lowered.includes('converting')) return 'Preparing render…';
  if (lowered.includes('rendering')) return 'Rendering images…';
  if (lowered === 'done') return 'Done.';
  if (lowered === 'queued') return 'Queued.';
  if (lowered === 'error') return 'Something went wrong.';

  return msg
    .replace(/\bblender\b/gi, 'renderer')
    .replace(/\.glb\b/gi, 'model')
    .replace(/\.blend\b/gi, 'scene');
}

export default function ClearCanvasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clearCanvas = useCanvasState((s) => s.clearCanvas);
  const defaultHuman = useCanvasState((s) => s.defaultHuman);

  const [isWorking, setIsWorking] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!open && esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  const onDeleteOnly = () => {
    // Simple delete (soft clear)
    clearCanvas();
    onClose();
  };

  const onDeleteAndResetHuman = async () => {
    setIsWorking(true);
    setStatus('Starting...');
    setProgress(0);

    try {
      const resp = await fetch(`${SERVER_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultHuman),
      });

      if (!resp.ok) throw new Error('Render server rejected request');

      const { jobId } = await resp.json();
      setStatus('Queued…');

      const es = new EventSource(`${SERVER_URL}/api/jobs/${jobId}/events`);
      esRef.current = es;

      es.onmessage = async (evt) => {
        try {
          const data = JSON.parse(evt.data) as any;
          setStatus(sanitizeStatusMessage(data.message || ''));
          setProgress(data.progress ?? 0);

          if (data.status === 'done') {
            es.close();
            esRef.current = null;

            const imagesResp = await fetch(`${SERVER_URL}/api/jobs/${jobId}/images`);
            if (!imagesResp.ok) throw new Error('Could not download images');
            const payload = (await imagesResp.json()) as { jobId: string; frontDataUrl: string; backDataUrl: string };

            // Cache stored images for later use
            storeBiomeshManImages({
              params: defaultHuman,
              frontDataUrl: payload.frontDataUrl,
              backDataUrl: payload.backDataUrl,
            });

            const [frontBlobUrl, backBlobUrl] = await Promise.all([
              dataUrlToBlobUrl(payload.frontDataUrl),
              dataUrlToBlobUrl(payload.backDataUrl),
            ]);

            // Clear canvas without reloading, then apply
            clearCanvas();

            // apply images on canvas
            applyManImagesToCanvas({
              frontSrc: frontBlobUrl,
              backSrc: backBlobUrl,
              targetHeightMm: defaultHuman.units === 'imperial' ? defaultHuman.height * 25.4 : defaultHuman.height * 10,
            });

            setIsWorking(false);
            onClose();
          }

          if (data.status === 'error') {
            es.close();
            esRef.current = null;

            // Ask for error details
            try {
              const statusResp = await fetch(`${SERVER_URL}/api/jobs/${jobId}/status`);
              const statusJson = await statusResp.json();
              const rawErr = statusJson?.error ? String(statusJson.error) : String(statusJson?.detail || statusJson?.message || 'Job failed');
              const lowered = rawErr.toLowerCase();
              if (lowered.includes('blender') || lowered.includes('glb->blend') || lowered.includes('blend')) {
                setStatus('Rendering failed. Please try again.');
              } else {
                setStatus(ERROR_MSG);
              }
            } catch (err) {
              setStatus('Job failed.');
            }

            setIsWorking(false);
          }
        } catch (e) {
          setIsWorking(false);
          setStatus(ERROR_MSG);
          if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
          }
        }
      };

      es.onerror = () => {
        setStatus('Lost connection to the render server. If the backend stopped, start it and try again.');
        setIsWorking(false);
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }
      };
    } catch (e) {
      setIsWorking(false);
      setStatus('Failed to start job');
    }
  };

  return (
    <div className="fixed inset-0 z-[20000]">
      <div className="absolute inset-0 bg-black/50" onClick={() => { if (!isWorking) onClose(); }} />

      <div className="absolute left-1/2 top-1/2 w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-lg bg-white border border-gray-200 p-6 shadow-xl">
          <div className="text-lg font-semibold">Clear Canvas</div>
          <div className="mt-2 text-sm text-gray-700">This will delete everything on the canvas. Choose an option:</div>

          <div className="mt-4 flex gap-3">
            <button className="px-3 py-2 rounded-md bg-blue-600 text-white" onClick={onDeleteOnly} disabled={isWorking}>Delete</button>
            <button className="px-3 py-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50" onClick={onDeleteAndResetHuman} disabled={isWorking}>Delete and Reset Human</button>
            <button className="ml-auto px-3 py-2 rounded-md border bg-white" onClick={() => { if (!isWorking) onClose(); }} disabled={isWorking}>Cancel</button>
          </div>

          {isWorking && (
            <div className="mt-4">
              <div className="text-sm text-gray-700">{status}</div>
              <div className="mt-2 w-full bg-gray-200 h-2 rounded overflow-hidden">
                <div className="h-2 bg-blue-500" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
