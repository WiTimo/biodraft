import { useCallback, useEffect, useRef, useState } from 'react';
import { useCanvasState } from '../state/CanvasState';
import type { CanvasPresent } from '../state/types';

export function ThreeDView() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const isSimulationMode = useCanvasState((state) => state.isSimulationMode);
  const setIsSimulationMode = useCanvasState((state) => state.setIsSimulationMode);

  const latestPresentRef = useRef<CanvasPresent>(useCanvasState.getState().present);
  const rafIdRef = useRef<number | null>(null);

  const postMessageToIframe = useCallback((message: unknown) => {
    if (!iframeLoaded) return;
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    target.postMessage(message, '*');
  }, [iframeLoaded]);

  const buildPatternPayload = useCallback((present: CanvasPresent) => {
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
      texture: path.texture ? {
        src: path.texture.src,
        scaleX: path.texture.scaleX ?? 1,
        scaleY: path.texture.scaleY ?? 1,
        offsetX: path.texture.offsetX ?? 0,
        offsetY: path.texture.offsetY ?? 0,
        rotation: path.texture.rotation ?? 0,
        repeat: path.texture.repeat ?? 'repeat'
      } : undefined,
    }));

    return { patterns, seams: present.seams };
  }, []);

  const sendPatterns = useCallback((present?: CanvasPresent) => {
    if (!iframeLoaded) return;
    const payloadSource = present ?? useCanvasState.getState().present;
    postMessageToIframe({ type: 'setClothPattern', payload: buildPatternPayload(payloadSource) });
  }, [iframeLoaded, postMessageToIframe, buildPatternPayload]);

  const sendMode = useCallback((mode: 'edit' | 'live') => {
    postMessageToIframe({ type: 'setSimulationMode', payload: mode });
  }, [postMessageToIframe]);

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
      sendMode(isSimulationMode ? 'live' : 'edit');
    }, 200);
    return () => window.clearTimeout(timer);
  }, [iframeLoaded, isSimulationMode, sendMode]);

  const handleModeToggle = useCallback((mode: 'edit' | 'live') => {
    const nextIsLive = mode === 'live';
    setIsSimulationMode(nextIsLive);
    if (iframeLoaded) {
      sendMode(mode);
      sendPatterns();
    }
  }, [iframeLoaded, sendMode, sendPatterns, setIsSimulationMode]);

  const handleReload = useCallback(() => {
    setIframeLoaded(false);
    if (iframeRef.current) {
      iframeRef.current.setAttribute('src', iframeRef.current.src);
    }
  }, []);

  const modeButtonClass = (active: boolean) =>
    `h-10 px-4 rounded-lg border-2 font-semibold transition-colors ${
      active
        ? 'bg-blue-600 text-white border-blue-600'
        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
    }`;

  return (
    <>
      <iframe
        ref={iframeRef}
        src='http://localhost:5500/cloth-ammo/index.html'
        className='h-full w-full'
        onLoad={() => setIframeLoaded(true)}
      />
      <div className='absolute left-4 top-4 flex gap-2'>
        <button
          type='button'
          className={modeButtonClass(!isSimulationMode)}
          onClick={() => handleModeToggle('edit')}
        >
          Edit
        </button>
        <button
          type='button'
          className={modeButtonClass(isSimulationMode)}
          onClick={() => handleModeToggle('live')}
        >
          Live
        </button>
        <button
          type='button'
          className='h-10 w-10 rounded-lg bg-white p-2 border-2 border-gray-400 hover:border-blue-400 cursor-pointer'
          name='Reload View'
          onClick={handleReload}
        >
          <img src='/svg/reset.svg' alt='Reload View' />
        </button>
      </div>
    </>
  );
}
