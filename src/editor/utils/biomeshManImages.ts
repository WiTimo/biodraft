export type BiomeshManParams = {
  gender: 'male' | 'female';
  height: number;
  weight: number;
  muscle: number; // 0-100
  units: 'metric' | 'imperial';
};

export type StoredBiomeshManImages = {
  version: 1;
  createdAt: string;
  params: BiomeshManParams;
  frontDataUrl: string;
  backDataUrl: string;
};

const STORAGE_KEY = 'techpack.biomeshManImages.v1';
const PARAMS_KEY = 'techpack.biomeshManParams.v1';

export const DEFAULT_BIOMESH_MAN_PARAMS: BiomeshManParams = {
  gender: 'male',
  height: 185,
  weight: 88,
  muscle: 20,
  units: 'metric',
};

export function loadStoredBiomeshManImages(): StoredBiomeshManImages | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBiomeshManImages;

    if (parsed?.version !== 1) return null;
    if (!parsed.frontDataUrl || !parsed.backDataUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeBiomeshManImages(payload: Omit<StoredBiomeshManImages, 'version' | 'createdAt'>) {
  const toStore: StoredBiomeshManImages = {
    version: 1,
    createdAt: new Date().toISOString(),
    ...payload,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  localStorage.setItem(PARAMS_KEY, JSON.stringify(payload.params));
}

export function loadLastBiomeshParams(): BiomeshManParams {
  try {
    const raw = localStorage.getItem(PARAMS_KEY);
    if (!raw) return DEFAULT_BIOMESH_MAN_PARAMS;
    const parsed = JSON.parse(raw) as Partial<BiomeshManParams>;
    return {
      ...DEFAULT_BIOMESH_MAN_PARAMS,
      ...parsed,
      muscle: typeof parsed.muscle === 'number' ? Math.min(100, Math.max(0, parsed.muscle)) : DEFAULT_BIOMESH_MAN_PARAMS.muscle,
      height: typeof parsed.height === 'number' ? parsed.height : DEFAULT_BIOMESH_MAN_PARAMS.height,
      weight: typeof parsed.weight === 'number' ? parsed.weight : DEFAULT_BIOMESH_MAN_PARAMS.weight,
      gender: parsed.gender === 'female' ? 'female' : 'male',
      units: parsed.units === 'imperial' ? 'imperial' : 'metric',
    };
  } catch {
    return DEFAULT_BIOMESH_MAN_PARAMS;
  }
}

export function clearStoredBiomeshManImages() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function dataUrlToBlobUrl(dataUrl: string): Promise<string> {
  // Fetching a data URL yields a Blob without manual base64 decoding.
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

export function revokeIfBlobUrl(url: string | null | undefined) {
  if (!url) return;
  if (url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}
