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

        const scale = 0.8;

        const frontWidth = frontImg.width * scale;
        const frontHeight = frontImg.height * scale;

        const backWidth = backImg.width * scale;
        const backHeight = backImg.height * scale;

        const totalWidth = frontWidth + backWidth + 40;

        const startX = (canvasWidth - totalWidth) / 2;
        const centerY = (canvasHeight - Math.max(frontHeight, backHeight)) / 2;

        state.addBackgroundImage('/images/man_front.png', frontId);
        state.moveBackgroundImage(frontId, startX, centerY);
        state.updateBackgroundImageTransform(frontId, {
          scaleX: scale,
          scaleY: scale,
          rotation: 0,
        });
        state.toggleLockBackgroundImage(frontId);

        const backX = startX + frontWidth + 40;
        state.addBackgroundImage('/images/man_back.png', backId);
        state.moveBackgroundImage(backId, backX, centerY);
        state.updateBackgroundImageTransform(backId, {
          scaleX: scale,
          scaleY: scale,
          rotation: 0,
        });
        state.toggleLockBackgroundImage(backId);

        const frontCenter = {
          x: startX + frontWidth / 2,
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
