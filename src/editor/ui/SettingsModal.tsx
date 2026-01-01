import { useEffect, useState } from 'react';
import { useCanvasState } from '../state/CanvasState';
import { cmToIn, inToCm, kgToLb, lbToKg, formatNumber, validateHeight, validateWeight } from '../utils/unitUtils';

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'general' | 'keybinds'>('general');

  // General settings (UI-only for now)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const units = useCanvasState((s) => s.units);
  const setUnits = useCanvasState((s) => s.setUnits);
  const metricUnit = useCanvasState((s) => s.metricUnit);
  const setMetricUnit = useCanvasState((s) => s.setMetricUnit);
  const [language, setLanguage] = useState<'en' | 'de'>('en');
  const showLeftRuler = useCanvasState((s) => s.showLeftRuler);
  const setShowLeftRuler = useCanvasState((s) => s.setShowLeftRuler);
  const showTopRuler = useCanvasState((s) => s.showTopRuler);
  const setShowTopRuler = useCanvasState((s) => s.setShowTopRuler);
  const gridEnabled = useCanvasState((s) => s.gridEnabled);
  const setGridEnabled = useCanvasState((s) => s.setGridEnabled);
  const defaultHuman = useCanvasState((s) => s.defaultHuman);
  const setDefaultHuman = useCanvasState((s) => s.setDefaultHuman);


  // helpers
  function convertHumanUnits(toUnits: 'metric' | 'imperial') {
    setFormHuman((f) => {
      if (f.units === toUnits) return f;
      try {
        const h = Number(f.height);
        const w = Number(f.weight);
        const nh = Number.isFinite(h)
          ? (toUnits === 'imperial' ? cmToIn(h) : inToCm(h))
          : '';
        const nw = Number.isFinite(w)
          ? (toUnits === 'imperial' ? kgToLb(w) : lbToKg(w))
          : '';
        return { ...f, units: toUnits, height: nh === '' ? '' : formatNumber(nh), weight: nw === '' ? '' : formatNumber(nw) };
      } catch {
        return { ...f, units: toUnits };
      }
    });
  }
  // Local form state so inputs can be edited freely (allow empty strings while typing)
  const [formHuman, setFormHuman] = useState<{ gender: string; units: string; height: string; weight: string; muscle: number }>({
    gender: defaultHuman.gender,
    units: defaultHuman.units,
    height: String(defaultHuman.height),
    weight: String(defaultHuman.weight),
    muscle: defaultHuman.muscle,
  });

  useEffect(() => {
    if (!open) return;
    // Reset form when modal opens
    setFormHuman({
      gender: defaultHuman.gender,
      units: defaultHuman.units,
      height: String(defaultHuman.height),
      weight: String(defaultHuman.weight),
      muscle: defaultHuman.muscle,
    });
  }, [open, defaultHuman]);

  // Validation (run after form state exists)
  const [heightError, setHeightError] = useState<string | null>(null);
  const [weightError, setWeightError] = useState<string | null>(null);

  // update validation on input change
  useEffect(() => {
    const hh = validateHeight(formHuman.units as 'metric' | 'imperial', formHuman.height);
    setHeightError(hh.valid ? null : hh.error ?? '');
    const ww = validateWeight(formHuman.units as 'metric' | 'imperial', formHuman.weight);
    setWeightError(ww.valid ? null : ww.error ?? '');
  }, [formHuman.height, formHuman.units, formHuman.weight]);

  const canSave = !(heightError || weightError);

  function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
    return (
      <label className="flex items-center justify-between w-full cursor-pointer">
        <span className="text-sm text-gray-700">{label}</span>
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors ' +
            (checked ? 'bg-blue-600' : 'bg-gray-200')
          }
          aria-pressed={checked}
        >
          <span
            className={
              'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ' +
              (checked ? 'translate-x-6' : 'translate-x-1')
            }
          />
        </button>
      </label>
    );
  }


  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="absolute left-1/2 top-1/2 w-[680px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-xl border border-gray-200 bg-white/95 backdrop-blur shadow-xl overflow-hidden h-[520px] max-h-[calc(100vh-48px)]">
          <div className="flex h-full">
            <div className="w-40 border-r border-gray-200 bg-gray-50 p-3 overflow-auto">
              <div className="flex flex-col gap-2">
                <button
                  className={
                    'text-sm text-left px-3 py-2 rounded-md ' +
                    (tab === 'general' ? 'bg-white font-semibold' : 'hover:bg-gray-100')
                  }
                  onClick={() => setTab('general')}
                >
                  General
                </button>
                <button
                  className={
                    'text-sm text-left px-3 py-2 rounded-md ' +
                    (tab === 'keybinds' ? 'bg-white font-semibold' : 'hover:bg-gray-100')
                  }
                  onClick={() => setTab('keybinds')}
                >
                  Keybinds
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-base font-semibold">Settings</div>
                  <button
                    className="text-sm px-3 py-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50"
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {tab === 'general' && (
                  <div className="flex flex-col gap-6">
                    {/* Theme */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-800">Appearance</div>
                          <div className="text-xs text-gray-500">Choose theme for the app</div>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          className={
                            'flex-1 text-sm px-3 py-2 rounded-md border ' +
                            (theme === 'light' ? 'bg-blue-50 border-blue-200 font-semibold' : 'bg-white hover:bg-gray-50')
                          }
                          onClick={() => setTheme('light')}
                        >
                          Light
                        </button>
                        <button
                          className={
                            'flex-1 text-sm px-3 py-2 rounded-md border ' +
                            (theme === 'dark' ? 'bg-blue-50 border-blue-200 font-semibold' : 'bg-white hover:bg-gray-50')
                          }
                          onClick={() => setTheme('dark')}
                        >
                          Dark
                        </button>
                        <button
                          className={
                            'flex-1 text-sm px-3 py-2 rounded-md border ' +
                            (theme === 'system' ? 'bg-blue-50 border-blue-200 font-semibold' : 'bg-white hover:bg-gray-50')
                          }
                          onClick={() => setTheme('system')}
                        >
                          System
                        </button>
                      </div>


                    </div>

                    {/* Language */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-800">Language</div>
                          <div className="text-xs text-gray-500">Select the interface language.</div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="sr-only">Language</label>
                        <div className="relative inline-block w-48">
                          <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as 'en' | 'de')}
                            className="block appearance-none w-full rounded-md border border-gray-200 bg-white px-3 py-2 pr-8 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          >
                            <option value="en">English</option>
                            <option value="de">Deutsch</option>
                          </select>
                          <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Units */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-800">Units</div>
                          <div className="text-xs text-gray-500">Choose your preferred measurement system</div>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2 items-center">
                        <button
                          className={
                            'text-sm px-3 py-2 rounded-md border ' +
                            (units === 'metric' ? 'bg-blue-50 border-blue-200 font-semibold' : 'bg-white hover:bg-gray-50')
                          }
                          onClick={() => { convertHumanUnits('metric'); setUnits('metric'); }}
                        >
                          Metric
                        </button>
                        <button
                          className={
                            'text-sm px-3 py-2 rounded-md border ' +
                            (units === 'imperial' ? 'bg-blue-50 border-blue-200 font-semibold' : 'bg-white hover:bg-gray-50')
                          }
                          onClick={() => { convertHumanUnits('imperial'); setUnits('imperial'); }}
                        >
                          Imperial
                        </button>

                        {units === 'metric' && (
                          <div className="ml-6 flex items-center gap-3">
                            <div className="text-sm text-gray-700">Metric units</div>
                            <div className="flex gap-2">
                              <button
                                className={
                                  'text-sm px-2 py-1 rounded-md border ' +
                                  (metricUnit === 'cm' ? 'bg-blue-50 border-blue-200 font-semibold' : 'bg-white hover:bg-gray-50')
                                }
                                onClick={() => setMetricUnit('cm')}
                              >
                                cm
                              </button>
                              <button
                                className={
                                  'text-sm px-2 py-1 rounded-md border ' +
                                  (metricUnit === 'mm' ? 'bg-blue-50 border-blue-200 font-semibold' : 'bg-white hover:bg-gray-50')
                                }
                                onClick={() => setMetricUnit('mm')}
                              >
                                mm
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rulers & Grid */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-800">Rulers & Grid</div>
                          <div className="text-xs text-gray-500">Toggle rulers and grid visibility</div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-gray-700">Left Ruler</div>
                            <div className="text-xs text-gray-500">Show/hide the left ruler</div>
                          </div>
                          <ToggleSwitch checked={showLeftRuler} onChange={setShowLeftRuler} />
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-gray-700">Top Ruler</div>
                            <div className="text-xs text-gray-500">Show/hide the top ruler</div>
                          </div>
                          <ToggleSwitch checked={showTopRuler} onChange={setShowTopRuler} />
                        </div>

                        <div className="col-span-2 flex items-center justify-between">
                          <div>
                            <div className="text-sm text-gray-700">Grid</div>
                            <div className="text-xs text-gray-500">Enable or disable the canvas grid</div>
                          </div>
                          <ToggleSwitch checked={gridEnabled} onChange={setGridEnabled} />
                        </div>


                      </div>
                    </div>

                    {/* Default Human */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-800">Default Human</div>
                          <div className="text-xs text-gray-500">Controls used when generating a default human on canvas clear</div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-gray-500">Gender</div>
                          <select
                            value={formHuman.gender}
                            onChange={(e) => setFormHuman((f) => ({ ...f, gender: e.target.value }))}
                            className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                          >
                            <option value="male">male</option>
                            <option value="female">female</option>
                          </select>
                        </div>

                        <div>
                          <div className="text-xs text-gray-500">Units</div>
                          <select
                            value={formHuman.units}
                            onChange={(e) => {
                              const to = e.target.value as 'metric' | 'imperial';
                              convertHumanUnits(to);
                            }}
                            className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                          >
                            <option value="metric">metric</option>
                            <option value="imperial">imperial</option>
                          </select>
                        </div>

                        <div>
                          <div className="text-xs text-gray-500">Height ({defaultHuman.units === 'metric' ? 'cm' : 'in'})</div>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formHuman.height}
                            onChange={(e) => setFormHuman((f) => ({ ...f, height: e.target.value }))}
                            className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                          />
                        </div>

                        <div>
                          <div className="text-xs text-gray-500">Weight ({defaultHuman.units === 'metric' ? 'kg' : 'lb'})</div>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formHuman.weight}
                            onChange={(e) => setFormHuman((f) => ({ ...f, weight: e.target.value }))}
                            className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                          />
                        </div>

                        {/* Inline validation messages for Default Human fields */}
                        <div className="col-span-2">
                          {heightError && <div className="text-xs text-red-600 mt-2">{heightError}</div>}
                          {weightError && <div className="text-xs text-red-600 mt-2">{weightError}</div>}
                        </div>

                        <div className="col-span-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm text-gray-700">Muscle</div>
                              <div className="text-xs text-gray-500">Adjust the default muscle level</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <a
                                href={`https://biomesh.flussing.com/?muscle=${formHuman.muscle}&gender=${formHuman.gender}&units=${formHuman.units}&height=${encodeURIComponent(formHuman.height)}&weight=${encodeURIComponent(formHuman.weight)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-700 hover:underline"
                                title="Open BioMesh in a new tab"
                              >
                                View it live
                              </a>
                              <div className="text-sm text-gray-500">{formHuman.muscle} / 100</div>
                            </div>
                          </div>

                          <input
                            className="mt-2 w-full accent-blue-600"
                            type="range"
                            min={0}
                            max={100}
                            value={formHuman.muscle}
                            onChange={(e) => setFormHuman((f) => ({ ...f, muscle: Number(e.target.value) }))}
                          />
                        </div>

                      </div>

                      <div className="mt-4 flex items-center justify-end gap-2">
                        <button
                          className="text-sm px-3 py-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50"
                          onClick={() => { /* Cancel: revert UI-only changes - currently no-op */ onClose(); }}
                        >
                          Cancel
                        </button>
                        <button
                          className={"text-sm px-4 py-2 rounded-md bg-blue-600 text-white " + (canSave ? '' : 'opacity-50')}
                          onClick={() => {
                            if (!canSave) return;
                            const h = Number(formHuman.height);
                            const w = Number(formHuman.weight);
                            const m = Number(formHuman.muscle);
                            setDefaultHuman({ gender: formHuman.gender as 'male' | 'female', units: formHuman.units as 'metric' | 'imperial', height: Math.max(0, h), weight: Math.max(0, w), muscle: Math.min(100, Math.max(0, m)) });
                            onClose();
                          }}
                          disabled={!canSave}
                        >
                          Save
                        </button>
                      </div>
                    </div>

                  </div>
                )}

                {tab === 'keybinds' && (
                  <div className="text-sm text-gray-600">Placeholder</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
