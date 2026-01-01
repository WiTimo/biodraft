import { useEffect, useMemo, useRef, useState } from 'react';
import { validateHeight, validateWeight, cmToIn, inToCm, formatNumber, kgToLb, lbToKg } from '../utils/unitUtils';
import {
  DEFAULT_BIOMESH_MAN_PARAMS,
  dataUrlToBlobUrl,
  loadLastBiomeshParams,
  storeBiomeshManImages,
  type BiomeshManParams,
} from '../utils/biomeshManImages';
import { applyManImagesToCanvas } from '../hooks/useStaticManImages';

type JobEvent = {
  jobId: string;
  progress: number;
  message: string;
  status: 'queued' | 'running' | 'done' | 'error';
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        'w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 shadow-sm ' +
        'focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50'
      }
    />
  );
}

function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement> & { asText?: boolean }) {
  const { asText, ...rest } = props;
  return (
    <input
      {...rest}
      type={asText ? 'text' : 'number'}
      inputMode={asText ? 'numeric' : undefined}
      className={
        'w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 shadow-sm ' +
        'focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50'
      }
    />
  );
}

function friendlyStatusLabel(status: JobEvent['status'] | 'idle') {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Working';
    case 'done':
      return 'Complete';
    case 'error':
      return 'Error';
    default:
      return 'Ready';
  }
}

function sanitizeStatusMessage(raw: string) {
  const msg = String(raw || '').trim();
  if (!msg) return '';

  // Keep status UI generic; avoid leaking implementation details.
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

  // Fallback: strip common implementation words.
  return msg
    .replace(/\bblender\b/gi, 'renderer')
    .replace(/\.glb\b/gi, 'model')
    .replace(/\.blend\b/gi, 'scene');
}

const ERROR_MSG = "Could not connect to the render server. Our Team currently investigating what is causing this issue. Please try again later."

// In dev, Vite proxies /api -> biomesh-render-server, so same-origin requests avoid CORS.
// If you deploy differently, set VITE_BIOMESH_RENDER_SERVER_URL to an absolute base URL.
const SERVER_URL = (import.meta as any).env?.VITE_BIOMESH_RENDER_SERVER_URL ?? '';

export function BiomeshManModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [params, setParams] = useState<BiomeshManParams>(DEFAULT_BIOMESH_MAN_PARAMS);
  // Local form so numeric inputs can be edited freely
  const [form, setForm] = useState<{ gender: string; units: string; height: string; weight: string; muscle: number }>({
    gender: DEFAULT_BIOMESH_MAN_PARAMS.gender,
    units: DEFAULT_BIOMESH_MAN_PARAMS.units,
    height: String(DEFAULT_BIOMESH_MAN_PARAMS.height),
    weight: String(DEFAULT_BIOMESH_MAN_PARAMS.weight),
    muscle: DEFAULT_BIOMESH_MAN_PARAMS.muscle,
  });

  const [status, setStatus] = useState<JobEvent['status'] | 'idle'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!open) return;
    const p = loadLastBiomeshParams();
    setParams(p);
    setForm({ gender: p.gender, units: p.units, height: String(p.height), weight: String(p.weight), muscle: p.muscle });
    setStatus('idle');
    setProgress(0);
    setMessage('');
    setError(null);
  }, [open]);

  // Validation
  const [heightErr, setHeightErr] = useState<string | null>(null);
  const [weightErr, setWeightErr] = useState<string | null>(null);

  useEffect(() => {
    const hh = validateHeight(form.units as 'metric' | 'imperial', form.height);
    setHeightErr(hh.valid ? null : hh.error ?? null);
    const ww = validateWeight(form.units as 'metric' | 'imperial', form.weight);
    setWeightErr(ww.valid ? null : ww.error ?? null);
  }, [form.height, form.units, form.weight]);

  const canSubmit = useMemo(() => {
    if (isSubmitting) return false;
    const hh = validateHeight(form.units as 'metric' | 'imperial', form.height);
    const ww = validateWeight(form.units as 'metric' | 'imperial', form.weight);
    if (!hh.valid || !ww.valid) return false;
    const m = form.muscle;
    if (m < 0 || m > 100) return false;
    return true;
  }, [isSubmitting, form.height, form.weight, form.muscle, form.units]);


  useEffect(() => {
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, []);



  const closeAndStopStreaming = () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setIsSubmitting(false);
    onClose();
  };

  const startJob = async (overrideParams?: BiomeshManParams) => {
    const jobParams = overrideParams ?? params;
    setIsSubmitting(true);
    setError(null);
    setMessage('Starting…');
    setProgress(0);
    setStatus('idle');

    try {
      const resp = await fetch(`${SERVER_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobParams),
      });

      if (!resp.ok) {
        const text = (await resp.text()).trim();
        throw new Error(text ? `Render server returned ${resp.status}: ${text}` : `Render server returned ${resp.status}.`);
      }

      const { jobId } = (await resp.json()) as { jobId: string };

      // Start SSE streaming
      const es = new EventSource(`${SERVER_URL}/api/jobs/${jobId}/events`);
      esRef.current = es;

      es.onmessage = async (evt) => {
        try {
          const data = JSON.parse(evt.data) as JobEvent;
          setStatus(data.status);
          setProgress(data.progress);
          setMessage(sanitizeStatusMessage(data.message));

          if (data.status === 'done') {
            es.close();
            esRef.current = null;

            const imagesResp = await fetch(`${SERVER_URL}/api/jobs/${jobId}/images`);
            if (!imagesResp.ok) {
              const t = (await imagesResp.text()).trim();
              throw new Error(
                t
                  ? `Could not download images (${imagesResp.status}): ${t}`
                  : `Could not download images (${imagesResp.status}).`
              );
            }

            const payload = (await imagesResp.json()) as {
              jobId: string;
              frontDataUrl: string;
              backDataUrl: string;
            };

            storeBiomeshManImages({
              params: jobParams,
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
              targetHeightMm: jobParams.units === 'imperial' ? jobParams.height * 25.4 : jobParams.height * 10,
            });

            setIsSubmitting(false);
            onClose();
          }
        } catch (e: any) {
          setError(ERROR_MSG);
          setIsSubmitting(false);
          if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
          }
        }
      };

      es.onerror = () => {
        setError('Lost connection to the render server. If the backend stopped, start it and try again.');
        setIsSubmitting(false);
        es.close();
        esRef.current = null;
      };
    } catch (e: any) {
      setError(ERROR_MSG);
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

      <div className="absolute left-1/2 top-1/2 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-xl border border-gray-200 bg-white/95 backdrop-blur shadow-xl">
          <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between">
            <div>
              <div className="text-base font-semibold text-gray-900">Generate Human Background</div>
              <div className="text-xs text-gray-500">Creates front/back reference images</div>
            </div>
            <button
              className="text-sm px-3 py-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
              onClick={closeAndStopStreaming}
            >
              Close
            </button>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gender">
                <SelectInput
                  value={form.gender}
                  onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                  disabled={isSubmitting}
                >
                  <option value="male">male</option>
                  <option value="female">female</option>
                </SelectInput>
              </Field>

              <Field label="Units">
                <SelectInput
                  value={form.units}
                  onChange={(e) => {
                    const to = e.target.value as 'metric' | 'imperial';
                    setForm((f) => {
                      if (f.units === to) return f;
                      // convert numbers
                      const h = Number(f.height);
                      const w = Number(f.weight);
                      const nh = Number.isFinite(h) ? (to === 'imperial' ? cmToIn(h) : inToCm(h)) : '';
                      const nw = Number.isFinite(w) ? (to === 'imperial' ? kgToLb(w) : lbToKg(w)) : '';
                      return { ...f, units: to, height: nh === '' ? '' : formatNumber(nh), weight: nw === '' ? '' : formatNumber(nw) };
                    });
                  }}
                  disabled={isSubmitting}
                >
                  <option value="metric">metric</option>
                  <option value="imperial">imperial</option>
                </SelectInput>
              </Field>

              <Field label={form.units === 'imperial' ? 'Height (in)' : 'Height (cm)'}>
                <NumberInput
                  asText
                  value={form.height}
                  onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
                  disabled={isSubmitting}
                />
                {heightErr && (
                  <div className="text-xs text-red-600 mt-1">{heightErr}</div>
                )}
              </Field>

              <Field label={form.units === 'imperial' ? 'Weight (lb)' : 'Weight (kg)'}>
                <NumberInput
                  asText
                  value={form.weight}
                  onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                  disabled={isSubmitting}
                />
                {weightErr && (
                  <div className="text-xs text-red-600 mt-1">{weightErr}</div>
                )}
              </Field>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-700">Muscle</div>
                <div className="flex items-center gap-3">
                  <a
                    href={`https://biomesh.flussing.com/?muscle=${form.muscle}&gender=${form.gender}&units=${form.units}&height=${encodeURIComponent(form.height || '')}&weight=${encodeURIComponent(form.weight || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-700 hover:underline"
                    title="Open BioMesh in a new tab"
                  >
                      View it live
                  </a>
                  <div className="text-xs text-gray-500">{form.muscle} / 100</div>
                </div>
              </div>
              <input
                className="mt-2 w-full accent-blue-600"
                type="range"
                min={0}
                max={100}
                value={form.muscle}
                onChange={(e) => setForm((f) => ({ ...f, muscle: Number(e.target.value) }))}
                disabled={isSubmitting}
              />
              <div className="mt-1 text-[11px] text-gray-500">Defaults to 0. Use the link above for details.</div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-700">Status</div>
                <div
                  className={
                    'text-[11px] px-2 py-0.5 rounded-full border ' +
                    (status === 'error'
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : status === 'done'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : status === 'running' || status === 'queued'
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600')
                  }
                >
                  {friendlyStatusLabel(status)}
                </div>
              </div>

              <div className="mt-2 w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>

              <div className="mt-2 text-sm text-gray-800">
                {status === 'idle' ? 'Ready.' : (message || 'Working…')}
              </div>

              {error && <div className="mt-2 text-sm text-red-700">{error}</div>}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                className="text-sm px-3 py-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
                onClick={() => {
                  setParams(DEFAULT_BIOMESH_MAN_PARAMS);
                  setForm({ gender: DEFAULT_BIOMESH_MAN_PARAMS.gender, units: DEFAULT_BIOMESH_MAN_PARAMS.units, height: String(DEFAULT_BIOMESH_MAN_PARAMS.height), weight: String(DEFAULT_BIOMESH_MAN_PARAMS.weight), muscle: DEFAULT_BIOMESH_MAN_PARAMS.muscle });
                }}
                disabled={isSubmitting}
              >
                Reset
              </button>
              <button
                className="text-sm px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => {
                  const parsedParams: BiomeshManParams = {
                    gender: form.gender === 'female' ? 'female' : 'male',
                    units: form.units === 'imperial' ? 'imperial' : 'metric',
                    height: Number(form.height),
                    weight: Number(form.weight),
                    muscle: form.muscle,
                  };
                  // Update stored params and start job with these values
                  setParams(parsedParams);
                  startJob(parsedParams);
                }}
                disabled={!canSubmit}
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
