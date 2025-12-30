import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_BIOMESH_MAN_PARAMS,
  dataUrlToBlobUrl,
  loadLastBiomeshParams,
  storeBiomeshManImages,
  type BiomeshManParams,
} from '../util/biomeshManImages';
import { applyManImagesToCanvas } from '../hooks/useStaticManImages';

type JobEvent = {
  jobId: string;
  progress: number;
  message: string;
  status: 'queued' | 'running' | 'done' | 'error';
};

// In dev, Vite proxies /api -> biomesh-render-server, so same-origin requests avoid CORS.
// If you deploy differently, set VITE_BIOMESH_RENDER_SERVER_URL to an absolute base URL.
const SERVER_URL = (import.meta as any).env?.VITE_BIOMESH_RENDER_SERVER_URL ?? '';

export function BiomeshManModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [params, setParams] = useState<BiomeshManParams>(DEFAULT_BIOMESH_MAN_PARAMS);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobEvent['status'] | 'idle'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!open) return;
    setParams(loadLastBiomeshParams());
    setJobId(null);
    setStatus('idle');
    setProgress(0);
    setMessage('');
    setError(null);
  }, [open]);

  useEffect(() => {
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, []);

  const canSubmit = useMemo(() => {
    if (isSubmitting) return false;
    if (params.height <= 0 || params.weight <= 0) return false;
    if (params.muscle < 0 || params.muscle > 100) return false;
    return true;
  }, [isSubmitting, params.height, params.weight, params.muscle]);

  const closeAndStopStreaming = () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setIsSubmitting(false);
    onClose();
  };

  const startJob = async () => {
    setIsSubmitting(true);
    setError(null);
    setMessage('Starting…');
    setProgress(0);
    setStatus('idle');

    try {
      const resp = await fetch(`${SERVER_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Server error (${resp.status}): ${text}`);
      }

      const { jobId } = (await resp.json()) as { jobId: string };
      setJobId(jobId);

      // Start SSE streaming
      const es = new EventSource(`${SERVER_URL}/api/jobs/${jobId}/events`);
      esRef.current = es;

      es.onmessage = async (evt) => {
        try {
          const data = JSON.parse(evt.data) as JobEvent;
          setStatus(data.status);
          setProgress(data.progress);
          setMessage(data.message);

          if (data.status === 'done') {
            es.close();
            esRef.current = null;

            const imagesResp = await fetch(`${SERVER_URL}/api/jobs/${jobId}/images`);
            if (!imagesResp.ok) {
              const t = await imagesResp.text();
              throw new Error(`Failed to download images (${imagesResp.status}): ${t}`);
            }

            const payload = (await imagesResp.json()) as {
              jobId: string;
              frontDataUrl: string;
              backDataUrl: string;
            };

            storeBiomeshManImages({
              params,
              frontDataUrl: payload.frontDataUrl,
              backDataUrl: payload.backDataUrl,
            });

            const [frontBlobUrl, backBlobUrl] = await Promise.all([
              dataUrlToBlobUrl(payload.frontDataUrl),
              dataUrlToBlobUrl(payload.backDataUrl),
            ]);

            applyManImagesToCanvas({
              frontSrc: frontBlobUrl,
              backSrc: backBlobUrl,
              targetHeightMm: params.units === 'imperial' ? params.height * 25.4 : params.height * 10,
            });

            setIsSubmitting(false);
            onClose();
          }

          if (data.status === 'error') {
            es.close();
            esRef.current = null;

            // Ask for error details
            try {
              const statusResp = await fetch(`${SERVER_URL}/api/jobs/${jobId}/status`);
              const statusJson = await statusResp.json();
              setError(statusJson?.error ? String(statusJson.error) : String(statusJson?.detail || statusJson?.message || 'Job failed'));
            } catch {
              setError('Job failed.');
            }

            setIsSubmitting(false);
          }
        } catch (e: any) {
          setError(String(e?.message || e));
          setIsSubmitting(false);
          if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
          }
        }
      };

      es.onerror = () => {
        setError('Lost connection to server stream.');
        setIsSubmitting(false);
        es.close();
        esRef.current = null;
      };
    } catch (e: any) {
      setError(String(e?.message || e));
      setIsSubmitting(false);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000]">
      <div className="absolute inset-0 bg-black/40" onClick={() => (isSubmitting ? null : closeAndStopStreaming())} />

      <div className="absolute left-1/2 top-1/2 w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold">Generate Man Background</div>
            <div className="text-xs text-gray-500">Creates front/back images from BioMesh</div>
          </div>
          <button
            className="text-sm px-3 py-1 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            onClick={closeAndStopStreaming}
          >
            Close
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">Gender</span>
              <select
                className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                value={params.gender}
                onChange={(e) => setParams((p) => ({ ...p, gender: e.target.value === 'female' ? 'female' : 'male' }))}
                disabled={isSubmitting}
              >
                <option value="male">male</option>
                <option value="female">female</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">Units</span>
              <select
                className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                value={params.units}
                onChange={(e) => setParams((p) => ({ ...p, units: e.target.value === 'imperial' ? 'imperial' : 'metric' }))}
                disabled={isSubmitting}
              >
                <option value="metric">metric</option>
                <option value="imperial">imperial</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">Height</span>
              <input
                className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                type="number"
                value={params.height}
                onChange={(e) => setParams((p) => ({ ...p, height: Number(e.target.value) }))}
                disabled={isSubmitting}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">Weight</span>
              <input
                className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                type="number"
                value={params.weight}
                onChange={(e) => setParams((p) => ({ ...p, weight: Number(e.target.value) }))}
                disabled={isSubmitting}
              />
            </label>
          </div>

          <label className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Muscle</span>
              <span className="text-xs text-gray-500">{params.muscle} / 100</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={params.muscle}
              onChange={(e) => setParams((p) => ({ ...p, muscle: Number(e.target.value) }))}
              disabled={isSubmitting}
            />
            <div className="text-[11px] text-gray-500">0 = not muscular, 100 = everyday gym</div>
          </label>

          <div className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-gray-700">Status</div>
              {jobId && <div className="text-[11px] text-gray-500">Job: {jobId}</div>}
            </div>

            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>

            <div className="mt-2 text-xs text-gray-700">
              {status === 'idle' && 'Ready.'}
              {status !== 'idle' && (message || 'Working…')}
            </div>

            {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              className="text-sm px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setParams(DEFAULT_BIOMESH_MAN_PARAMS)}
              disabled={isSubmitting}
            >
              Reset
            </button>
            <button
              className="text-sm px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={startJob}
              disabled={!canSubmit}
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
