import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import { useCanvasState } from "../state/CanvasState";
import type { CanvasPresent } from "../state/types";
import Icon from './Icon';

const FRONT_IMAGE_ID = "static-man";
const BACK_IMAGE_ID = "static-man-back";
const STATIC_MAN_DIMENSIONS_FALLBACK = { width: 1920, height: 1080 };
const HUMAN_REFERENCE_FALLBACK = {
  top: 17,
  bottom: 765,
  halfWidth: 718.5,
  frontHalfWidth: null as number | null,
  backHalfWidth: null as number | null,
  frontCenterX: -80,
  backCenterX: 1500,
};

type BackgroundImageEntry = CanvasPresent["backgroundImages"][number];

function computeImageMetrics(image: BackgroundImageEntry | undefined) {
  if (!image) return null;
    const scaleX = Number.isFinite(image.scaleX) ? image.scaleX : 1;
    const scaleY = Number.isFinite(image.scaleY) ? image.scaleY : 1;

    const imgObj = new Image();
    imgObj.src = image.src;
    if (!imgObj.naturalWidth || !imgObj.naturalHeight) {
      console.error("Image Size and Width not found")
    }
    const nativeWidth = imgObj.naturalWidth || STATIC_MAN_DIMENSIONS_FALLBACK.width;
    const nativeHeight = imgObj.naturalHeight || STATIC_MAN_DIMENSIONS_FALLBACK.height;
    
    const width = nativeWidth * scaleX;
    const height = nativeHeight * scaleY;

    return {
      width,
      height,
      halfWidth: width / 2,
      centerX: image.x + width / 2,
      top: image.y,
      bottom: image.y + height,
    };
}

function buildHumanReferencePayload(
  backgroundImages: CanvasPresent["backgroundImages"]
) {
  const payload = { ...HUMAN_REFERENCE_FALLBACK };
  const frontImage = backgroundImages.find((img) => img.id === FRONT_IMAGE_ID);
  const backImage = backgroundImages.find((img) => img.id === BACK_IMAGE_ID);

  const frontMetrics = computeImageMetrics(frontImage);
  const backMetrics = computeImageMetrics(backImage);

  if (frontMetrics) {
    payload.top = frontMetrics.top;
    payload.bottom = frontMetrics.bottom;
    payload.frontHalfWidth = frontMetrics.halfWidth;
    payload.frontCenterX = frontMetrics.centerX;
  }

  if (backMetrics) {
    if (!frontMetrics) {
      payload.top = backMetrics.top;
      payload.bottom = backMetrics.bottom;
    }
    payload.backHalfWidth = backMetrics.halfWidth;
    payload.backCenterX = backMetrics.centerX;
  }

  const halfWidthSamples: number[] = [];
  if (frontMetrics?.halfWidth) halfWidthSamples.push(frontMetrics.halfWidth);
  if (backMetrics?.halfWidth) halfWidthSamples.push(backMetrics.halfWidth);

  if (halfWidthSamples.length > 0) {
    payload.halfWidth =
      halfWidthSamples.reduce((sum, value) => sum + value, 0) /
      halfWidthSamples.length;
  }

    if (frontImage && frontMetrics) {
        const img = new Image();
        img.src = frontImage.src;
        
        if (img.naturalWidth > 0) {
             // @ts-ignore
             payload.backgroundImage = {
                 width: img.naturalWidth * (frontImage.scaleX || 1),
                 height: img.naturalHeight * (frontImage.scaleY || 1)
             };
        }
    }

    return payload;
}

export function ThreeDView() {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const isSimulationMode = useCanvasState((state) => state.isSimulationMode);
  const setIsSimulationMode = useCanvasState(
    (state) => state.setIsSimulationMode
  );

  const latestPresentRef = useRef<CanvasPresent>(
    useCanvasState.getState().present
  );
  const rafIdRef = useRef<number | null>(null);

  const postMessageToIframe = useCallback(
    (message: unknown) => {
      if (!iframeLoaded) return;
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      target.postMessage(message, "*");
    },
    [iframeLoaded]
  );

  const sendHumanReference = useCallback(() => {
    if (!iframeLoaded) return;
    const backgroundImages = useCanvasState.getState().present.backgroundImages;
    const payload = buildHumanReferencePayload(backgroundImages);
    postMessageToIframe({ type: "updateHuman2DReference", payload });
  }, [iframeLoaded, postMessageToIframe]);

  const buildPatternPayload = useCallback((present: CanvasPresent) => {
    const backgroundImages = present.backgroundImages;
    const humanRef = buildHumanReferencePayload(backgroundImages);
    
    const patterns = present.paths.map((path) => ({
      id: path.id,
      points: path.points.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        handleIn: { dx: p.handleIn.dx, dy: p.handleIn.dy },
        handleOut: { dx: p.handleOut.dx, dy: p.handleOut.dy },
      })),
      closed: path.closed,
      // include texture info so the simulation iframe can load and apply pattern textures
      texture: path.texture
        ? {
            src: path.texture.src,
            scaleX: path.texture.scaleX ?? 1,
            scaleY: path.texture.scaleY ?? 1,
            offsetX: path.texture.offsetX ?? 0,
            offsetY: path.texture.offsetY ?? 0,
            rotation: path.texture.rotation ?? 0,
            repeat: path.texture.repeat ?? "repeat",
          }
        : undefined,
    }));

    return { 
        patterns, 
        seams: present.seams,
        ...humanRef
    };
  }, []);

  const sendPatterns = useCallback(
    (present?: CanvasPresent) => {
      if (!iframeLoaded) return;
      const payloadSource = present ?? useCanvasState.getState().present;
      postMessageToIframe({
        type: "setClothPattern",
        payload: buildPatternPayload(payloadSource),
      });
    },
    [iframeLoaded, postMessageToIframe, buildPatternPayload]
  );

  const sendMode = useCallback(
    (mode: "edit" | "live") => {
      postMessageToIframe({ type: "setSimulationMode", payload: mode });
    },
    [postMessageToIframe]
  );

  useEffect(() => {
    if (!iframeLoaded) return;

    latestPresentRef.current = useCanvasState.getState().present;

    const flush = () => {
      rafIdRef.current = null;
      sendPatterns(latestPresentRef.current);
    };

    const unsubscribe = useCanvasState.subscribe((state) => {
      latestPresentRef.current = state.present;
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(flush);
    });

    const timer = window.setTimeout(() => {
      sendPatterns(latestPresentRef.current);
    }, 200);

    return () => {
      unsubscribe();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      window.clearTimeout(timer);
    };
  }, [iframeLoaded, sendPatterns]);

  useEffect(() => {
    if (!iframeLoaded) return;
    const timer = window.setTimeout(() => {
      sendMode(isSimulationMode ? "live" : "edit");
    }, 200);
    return () => window.clearTimeout(timer);
  }, [iframeLoaded, isSimulationMode, sendMode]);

  useEffect(() => {
    if (!iframeLoaded) return;

    const sync = () => {
        sendHumanReference();
    };

    sync();

    const handleResize = () => sync();
    window.addEventListener("resize", handleResize);

    let previousBackgrounds =
      useCanvasState.getState().present.backgroundImages;
    const unsubscribe = useCanvasState.subscribe((state) => {
      const nextBackgrounds = state.present.backgroundImages;
      if (nextBackgrounds !== previousBackgrounds) {
        previousBackgrounds = nextBackgrounds;
        sync();
      }
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      unsubscribe();
    };
  }, [iframeLoaded, sendHumanReference]);

  const handleModeToggle = useCallback(
    (mode: "edit" | "live") => {
      const nextIsLive = mode === "live";
      setIsSimulationMode(nextIsLive);
      if (iframeLoaded) {
        sendMode(mode);
        sendPatterns();
      }
    },
    [iframeLoaded, sendMode, sendPatterns, setIsSimulationMode]
  );

  const handleReload = useCallback(() => {
    setIframeLoaded(false);
    if (iframeRef.current) {
      iframeRef.current.setAttribute("src", iframeRef.current.src);
    }
  }, []);

  const modeButtonClass = (active: boolean) =>
    `h-10 px-4 rounded-lg border-2 font-semibold transition-colors ${
      active
        ? "bg-blue-600 text-white border-blue-600"
        : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
    }`;

  return (
    <>
      <iframe
        ref={iframeRef}
        src="http://localhost:5500/cloth-ammo/index.html"
        className="h-full w-full"
        onLoad={() => setIframeLoaded(true)}
      />
      <div className="absolute left-4 top-4 flex gap-2">
        <button
          type="button"
          className={modeButtonClass(!isSimulationMode)}
          onClick={() => handleModeToggle("edit")}
        >
          {t('common.edit')}
        </button>
        <button
          type="button"
          className={modeButtonClass(isSimulationMode)}
          onClick={() => handleModeToggle("live")}
        >
          {t('common.live')}
        </button>
        <button
          type="button"
          className="h-10 w-10 rounded-lg bg-white p-2 border-2 border-gray-400 hover:border-blue-400 cursor-pointer"
          name={t('threeD.reloadView')}
          onClick={handleReload}
        >
          <Icon src="/svg/reset.svg" alt={t('threeD.reloadView')} />
        </button>
      </div>
    </>
  );
}
