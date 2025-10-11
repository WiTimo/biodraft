import React, { useEffect, useRef, useState } from 'react';
import { useCanvasState } from '../state/CanvasState';

export function ThreeDView() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  function sendDataToIframe(){
    if(!iframeRef.current || !iframeLoaded) return;
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

      console.log('iframe loaded, sending data to cloth sim');
      if (!iframeRef.current?.contentWindow) return;
      iframeRef.current.contentWindow.postMessage(
        { type: 'setClothPattern', payload: data },
        '*'
      );

  }

  useEffect(() => {
    setTimeout(() => {
      sendDataToIframe();
    }, 500)
  }, [iframeRef.current, iframeLoaded]);

  return (
    <>
    <iframe
      ref={iframeRef}
      src='http://localhost:5500/cloth-ammo/index.html'
      className='h-full w-full'
      onLoad={() => setIframeLoaded(true)}
    />
    <button 
      className='absolute left-4 top-4 h-12 w-12 rounded-lg bg-white p-2 border-gray-400 border-2 cursor-pointer' 
      name='Reload View' 
      onClick={() => {
      setIframeLoaded(false);
      iframeRef.current?.setAttribute("src", iframeRef.current.src);
    }}>
      <img src='/svg/reset.svg' alt='Reload View' />
    </button>
    </>);
}
