import { useCallback, useEffect, useState } from 'react';

interface SplitResizeOptions {
  setSplitWidth: (width: number) => void;
  setIsSimulationMode: (value: boolean) => void;
}

export function useSplitResize({ setSplitWidth, setIsSimulationMode }: SplitResizeOptions) {
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      const minWidth = 100;
      const maxWidth = window.innerWidth - 100;
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, event.clientX));
      setSplitWidth(nextWidth);
      setIsSimulationMode(false);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setIsSimulationMode, setSplitWidth]);

  const startResize = useCallback(() => setIsResizing(true), []);

  return { isResizing, startResize };
}
