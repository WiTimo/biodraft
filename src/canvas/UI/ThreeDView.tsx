import React, { useEffect, useRef } from 'react';
import { useCanvasState } from '../state/CanvasState';

export function ThreeDView() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const { paths, seams } = useCanvasState.getState().present;

    const patterns = paths.map((path) => ({
      id: path.id,
      points: path.points.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        handleIn: { dx: p.handleIn.dx, dy: p.handleIn.dy },
        handleOut: { dx: p.handleOut.dx, dy: p.handleOut.dy },
      })),
      closed: path.closed,
    }));

    const data = { patterns, seams };

    const handleIframeLoad = () => {
      console.log('iframe loaded, sending data to cloth sim');
      if (!iframeRef.current?.contentWindow) return;
      iframeRef.current.contentWindow.postMessage(
        { type: 'setClothPattern', payload: data },
        '*'
      );
    };

    const iframe = iframeRef.current;
    iframe?.addEventListener('load', handleIframeLoad);

    return () => {
      iframe?.removeEventListener('load', handleIframeLoad);
    };
  }, [iframeRef.current]);

  return (
    <iframe
      ref={iframeRef}
      src='http://localhost:5500/cloth-ammo/index.html'
      className='h-full w-full'
    />
  );
}
