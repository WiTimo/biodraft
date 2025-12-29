import { useEffect } from 'react';
import { useCanvasState } from '../state/CanvasState';

const DEFAULT_FRONT_ID = 'static-man';
const DEFAULT_BACK_ID = 'static-man-back';

export function useStaticManImages(
  frontId: string = DEFAULT_FRONT_ID,
  backId: string = DEFAULT_BACK_ID,
) {
  useEffect(() => {
    const state = useCanvasState.getState();

    // Remove any existing static man images first
    state.removeBackgroundImage(backId);
    state.removeBackgroundImage(frontId);

    let cancelled = false;

    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = src;
      });

    // Load both images in parallel and only proceed when both have loaded
    Promise.all([loadImage('/images/man_front.png'), loadImage('/images/man_back.png')])
      .then(([frontImg, backImg]) => {
        if (cancelled) return;

        const canvasWidth = 1418;
        const canvasHeight = 798;

        const availableHeight = canvasHeight - 100;
        const scale = Math.min(availableHeight / frontImg.height, availableHeight / backImg.height, 0.9);

        const frontWidth = frontImg.width * scale;
        const frontHeight = frontImg.height * scale;
        const backWidth = backImg.width * scale;
        const backHeight = backImg.height * scale;

        const splitX = canvasWidth / 2;

        // Center Front image in left half
        const frontX = (splitX - frontWidth) / 2;
        const centerY = (canvasHeight - frontHeight) / 2; // Vertically centered

        // Center Back image in right half
        const backX = splitX + (splitX - backWidth) / 2;

        state.addBackgroundImage('/images/man_front.png', frontId);
        state.moveBackgroundImage(frontId, frontX, centerY);
        state.updateBackgroundImageTransform(frontId, {
          scaleX: scale,
          scaleY: scale,
          rotation: 0,
        });
        state.toggleLockBackgroundImage(frontId);

        state.addBackgroundImage('/images/man_back.png', backId);
        state.moveBackgroundImage(backId, backX, centerY);
        state.updateBackgroundImageTransform(backId, {
          scaleX: scale,
          scaleY: scale,
          rotation: 0,
        });
        state.toggleLockBackgroundImage(backId);

        const frontCenter = {
          x: frontX + frontWidth / 2,
          y: centerY + frontHeight / 2,
        };
        const backCenter = {
          x: backX + backWidth / 2,
          y: centerY + backHeight / 2,
        };
        state.setManImageCenter(frontId, frontCenter);
        state.setManImageCenter(backId, backCenter);
      })
      .catch((err) => {
        console.warn('Failed to load static man images', err);
      });

    return () => {
      cancelled = true;
    };
  }, [frontId, backId]);
}
