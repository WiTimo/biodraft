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

    state.removeBackgroundImage(backId);
    state.removeBackgroundImage(frontId);

    const frontImg = new Image();
    frontImg.src = '/images/man_front.png';

    const backImg = new Image();
    backImg.src = '/images/man_back.png';

    frontImg.onload = () => {
      backImg.onload = () => {
        const canvasWidth = 1418;
        const canvasHeight = 798;

        // New requested image layout:
        // Images are larger/closer to dividing line.
        // We'll place them explicitly.
        // Assuming the split is roughly at X=canvasWidth/2 (709).
        
        // Let's center them in their respective halves more deliberately.
        // Or just use the user's observation "closer to the dividing line".
        // Let's fix the scale to 1.0 (since they are reference images, 1:1 pixel mapping is best for pattern drawing).
        // Or if they are too big, we scale.
        // Previous scale was 0.8.
        // If the user says "images have a different size now", let's respect the natural size or a reasonable fit.
        // Let's try a slightly larger scale or fit to height.
        
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
      };
    };
  }, [frontId, backId]);
}
