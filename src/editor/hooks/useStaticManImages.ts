import { useEffect } from 'react';
import { useCanvasState } from '../state/CanvasState';
import { dataUrlToBlobUrl, loadStoredBiomeshManImages, revokeIfBlobUrl } from '../utils/biomeshManImages';

const DEFAULT_FRONT_ID = 'static-man';
const DEFAULT_BACK_ID = 'static-man-back';

const DEFAULT_FRONT_SRC = '/images/man_front.png';
const DEFAULT_BACK_SRC = '/images/man_back.png';

// Default static images represent a 175cm person.
const DEFAULT_HEIGHT_CM = 175;
const DEFAULT_HEIGHT_MM = DEFAULT_HEIGHT_CM * 10;
const MM_PER_WORLD_UNIT = 10;

let lastApplyToken = 0;

type OpaqueBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

async function getOpaqueBounds(img: HTMLImageElement): Promise<OpaqueBounds> {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1, width: w, height: h };
  }

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h).data;
  const alphaThreshold = 10;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a <= alphaThreshold) continue;
    const p = i / 4;
    const x = p % w;
    const y = Math.floor(p / w);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  if (maxX < 0 || maxY < 0) {
    // Fully transparent fallback.
    return { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1, width: w, height: h };
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function heightToMm(height: number, units: 'metric' | 'imperial'): number {
  // BioMesh API/UI uses cm for metric; for imperial treat as inches.
  if (units === 'imperial') return height * 25.4;
  return height * 10;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

export function applyManImagesToCanvas({
  frontSrc,
  backSrc,
  frontId = DEFAULT_FRONT_ID,
  backId = DEFAULT_BACK_ID,
  targetHeightMm = DEFAULT_HEIGHT_MM,
}: {
  frontSrc: string;
  backSrc: string;
  frontId?: string;
  backId?: string;
  targetHeightMm?: number;
}) {
  const token = ++lastApplyToken;
  const state = useCanvasState.getState();

  // If we are replacing previously-generated blob URLs, revoke them to prevent leaks.
  const existingFront = state.present.backgroundImages.find((img) => img.id === frontId);
  const existingBack = state.present.backgroundImages.find((img) => img.id === backId);
  revokeIfBlobUrl(existingFront?.src);
  revokeIfBlobUrl(existingBack?.src);

  // Remove any existing man images first
  state.removeBackgroundImage(backId);
  state.removeBackgroundImage(frontId);

  Promise.all([loadImage(frontSrc), loadImage(backSrc)])
    .then(async ([frontImg, backImg]) => {
      if (token !== lastApplyToken) return;

      const [frontBounds, backBounds] = await Promise.all([
        getOpaqueBounds(frontImg),
        getOpaqueBounds(backImg),
      ]);
      if (token !== lastApplyToken) return;

      const viewportEl = (typeof document !== 'undefined')
        ? (document.querySelector('[data-canvas-viewport="true"]') as HTMLElement | null)
        : null;
      const rect = viewportEl?.getBoundingClientRect();

      // World-space dimensions of the visible viewport.
      const zoom = useCanvasState.getState().zoom;
      const offset = useCanvasState.getState().offset;
      const viewW = (rect?.width ? Math.max(0, rect.width) : 1418) / (zoom || 1);
      const viewH = (rect?.height ? Math.max(0, rect.height) : 798) / (zoom || 1);
      const worldLeft = -(offset?.x || 0) / (zoom || 1);
      const worldTop = -(offset?.y || 0) / (zoom || 1);

      const viewMidY = worldTop + viewH / 2;

      // Scale so that the *opaque body height* matches the requested height.
      // World units are centimeters; ruler is millimeters.
      const bodyPixelHeight = Math.max(frontBounds.height, backBounds.height);
      const targetHeightWorld = targetHeightMm / MM_PER_WORLD_UNIT;
      const scale = bodyPixelHeight > 0 ? targetHeightWorld / bodyPixelHeight : 1;

      const frontBodyW = frontBounds.width * scale;
      const frontBodyH = frontBounds.height * scale;
      const backBodyW = backBounds.width * scale;
      const backBodyH = backBounds.height * scale;

      // Place both bodies as a centered pair, with spacing proportional to body size.
      const maxBodyH = Math.max(frontBodyH, backBodyH);
      const bodyY = viewMidY - maxBodyH / 2;

      const baseGap = 0.18 * Math.max(frontBodyW, backBodyW);
      const minGap = 8;
      let gap = Math.max(minGap, baseGap);

      const totalW = frontBodyW + gap + backBodyW;
      if (totalW > viewW * 0.98) {
        // If viewport is too small, shrink the gap but keep a minimal separation.
        const maxGap = Math.max(minGap, viewW * 0.98 - (frontBodyW + backBodyW));
        gap = Math.max(minGap, maxGap);
      }

      const totalW2 = frontBodyW + gap + backBodyW;
      const startX = worldLeft + (viewW - totalW2) / 2;
      const frontBodyX = startX;
      const backBodyX = startX + frontBodyW + gap;

      // Convert from body-bbox positioning to image positioning by subtracting opaque bbox offset.
      const frontX = frontBodyX - frontBounds.minX * scale;
      const frontY = bodyY - frontBounds.minY * scale;
      const backX = backBodyX - backBounds.minX * scale;
      const backY = bodyY - backBounds.minY * scale;

      // IMPORTANT: Do not push to undo history for man generation.
      // We therefore update Zustand state directly (no slice actions that call saveState).
      useCanvasState.setState((s) => {
        const others = s.present.backgroundImages.filter((img) => img.id !== frontId && img.id !== backId);
        const frontImage = {
          id: frontId,
          src: frontSrc,
          x: frontX,
          y: frontY,
          scaleX: scale,
          scaleY: scale,
          rotation: 0,
          opacity: 0.4,
          locked: true,
          nativeWidth: frontImg.width,
          nativeHeight: frontImg.height,
        };
        const backImage = {
          id: backId,
          src: backSrc,
          x: backX,
          y: backY,
          scaleX: scale,
          scaleY: scale,
          rotation: 0,
          opacity: 0.4,
          locked: true,
          nativeWidth: backImg.width,
          nativeHeight: backImg.height,
        };

        // Keep man images behind user-added backgrounds.
        return {
          present: {
            ...s.present,
            backgroundImages: [frontImage, backImage, ...others],
          },
          selectedBackgroundId: s.selectedBackgroundId === frontId || s.selectedBackgroundId === backId
            ? null
            : s.selectedBackgroundId,
        };
      });

      const frontCenter = {
        x: frontX + (frontBounds.minX + frontBounds.width / 2) * scale,
        y: frontY + (frontBounds.minY + frontBounds.height / 2) * scale,
      };
      const backCenter = {
        x: backX + (backBounds.minX + backBounds.width / 2) * scale,
        y: backY + (backBounds.minY + backBounds.height / 2) * scale,
      };
      state.setManImageCenter(frontId, frontCenter);
      state.setManImageCenter(backId, backCenter);
    })
    .catch((err) => {
      if (token !== lastApplyToken) return;
      console.warn('Failed to load man images', err);
    });
}

export function useStaticManImages(
  frontId: string = DEFAULT_FRONT_ID,
  backId: string = DEFAULT_BACK_ID,
) {
  useEffect(() => {
    let cancelled = false;
    let runtimeFront: string | null = null;
    let runtimeBack: string | null = null;

    (async () => {
      const stored = loadStoredBiomeshManImages();
      if (stored?.frontDataUrl && stored?.backDataUrl) {
        // Convert base64 -> blob URL so we don't store huge strings inside zustand state/history.
        runtimeFront = await dataUrlToBlobUrl(stored.frontDataUrl);
        runtimeBack = await dataUrlToBlobUrl(stored.backDataUrl);
        if (cancelled) {
          revokeIfBlobUrl(runtimeFront);
          revokeIfBlobUrl(runtimeBack);
          return;
        }
        applyManImagesToCanvas({
          frontSrc: runtimeFront,
          backSrc: runtimeBack,
          frontId,
          backId,
          targetHeightMm: heightToMm(stored.params.height, stored.params.units),
        });
        return;
      }

      applyManImagesToCanvas({
        frontSrc: DEFAULT_FRONT_SRC,
        backSrc: DEFAULT_BACK_SRC,
        frontId,
        backId,
        targetHeightMm: DEFAULT_HEIGHT_MM,
      });
    })().catch((err) => {
      console.warn('Failed to prepare man images', err);
      applyManImagesToCanvas({
        frontSrc: DEFAULT_FRONT_SRC,
        backSrc: DEFAULT_BACK_SRC,
        frontId,
        backId,
        targetHeightMm: DEFAULT_HEIGHT_MM,
      });
    });

    return () => {
      cancelled = true;
      // If the hook created runtime blob URLs, revoke them.
      revokeIfBlobUrl(runtimeFront);
      revokeIfBlobUrl(runtimeBack);
    };
  }, [frontId, backId]);
}
