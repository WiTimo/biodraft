import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCanvasState } from '../state/CanvasState';
import { applyManImagesToCanvas } from '../hooks/useStaticManImages';
import { dataUrlToBlobUrl, storeBiomeshManImages } from '../utils/biomeshManImages';

const SERVER_URL = (import.meta as any).env?.VITE_BIOMESH_RENDER_SERVER_URL ?? '';

function sanitizeStatusMessage(raw: string) {
  const msg = String(raw || '').trim();
  if (!msg) return '';

  return msg
    .replace(/\bblender\b/gi, 'renderer')
    .replace(/\.glb\b/gi, 'model')
    .replace(/\.blend\b/gi, 'scene');
}

export default function ClearCanvasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
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
    // Simple delete (soft clear) - preserve generated human images if present
    clearCanvas(true);
    onClose();
  };

  const onDeleteAndResetHuman = async () => {
    setIsWorking(true);
    setStatus(t('clearCanvas.starting'));
    setProgress(0);

    try {
      const resp = await fetch(`${SERVER_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultHuman),
      });

      if (!resp.ok) throw new Error('renderServerRejectedRequest');

      const { jobId } = await resp.json();
      setStatus(t('clearCanvas.queued'));

      const es = new EventSource(`${SERVER_URL}/api/jobs/${jobId}/events`);
      esRef.current = es;

      es.onmessage = async (evt) => {
        try {
          const data = JSON.parse(evt.data) as any;

          const rawMsg = sanitizeStatusMessage(data.message || '');
          const lowered = rawMsg.toLowerCase();
          if (lowered.includes('validating')) setStatus(t('clearCanvas.status.preparing'));
          else if (lowered.includes('generating model') || lowered.includes('requesting')) setStatus(t('clearCanvas.status.generatingModel'));
          else if (lowered.includes('downloading')) setStatus(t('clearCanvas.status.downloadingModel'));
          else if (lowered.includes('preparing render') || lowered.includes('converting')) setStatus(t('clearCanvas.status.preparingRender'));
          else if (lowered.includes('rendering')) setStatus(t('clearCanvas.status.renderingImages'));
          else if (lowered === 'done') setStatus(t('clearCanvas.status.done'));
          else if (lowered === 'queued') setStatus(t('clearCanvas.status.queuedDot'));
          else if (lowered === 'error') setStatus(t('clearCanvas.status.error'));
          else setStatus(rawMsg);

          setProgress(data.progress ?? 0);

          if (data.status === 'done') {
            es.close();
            esRef.current = null;

            const imagesResp = await fetch(`${SERVER_URL}/api/jobs/${jobId}/images`);
            if (!imagesResp.ok) throw new Error('couldNotDownloadImages');
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
                setStatus(t('clearCanvas.errors.renderingFailedTryAgain'));
              } else {
                setStatus(t('clearCanvas.errors.connectGeneric'));
              }
            } catch (err) {
              setStatus(t('clearCanvas.errors.jobFailed'));
            }

            setIsWorking(false);
          }
        } catch (e) {
          setIsWorking(false);
          setStatus(t('clearCanvas.errors.connectGeneric'));
          if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
          }
        }
      };

      es.onerror = () => {
        setStatus(t('clearCanvas.errors.lostConnection'));
        setIsWorking(false);
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }
      };
    } catch (e) {
      setIsWorking(false);
      const msg = String((e as any)?.message || '');
      if (msg.includes('renderServerRejectedRequest')) setStatus(t('clearCanvas.errors.renderServerRejectedRequest'));
      else if (msg.includes('couldNotDownloadImages')) setStatus(t('clearCanvas.errors.couldNotDownloadImages'));
      else setStatus(t('clearCanvas.errors.failedToStartJob'));
    }
  };

  return (
    <div className="fixed inset-0 z-[20000]">
      <div className="absolute inset-0 bg-black/50" onClick={() => { if (!isWorking) onClose(); }} />

      <div className="absolute left-1/2 top-1/2 w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-lg bg-white border border-gray-200 p-6 shadow-xl">
          <div className="text-lg font-semibold">{t('clearCanvas.title')}</div>
          <div className="mt-2 text-sm text-gray-700">{t('clearCanvas.description')}</div>

          <div className="mt-4 flex gap-3">
            <button className="px-3 py-2 rounded-md bg-blue-600 text-white" onClick={onDeleteOnly} disabled={isWorking}>{t('common.delete')}</button>
            <button className="px-3 py-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50" onClick={onDeleteAndResetHuman} disabled={isWorking}>{t('clearCanvas.deleteAndResetHuman')}</button>
            <button className="ml-auto px-3 py-2 rounded-md border bg-white" onClick={() => { if (!isWorking) onClose(); }} disabled={isWorking}>{t('common.cancel')}</button>
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
