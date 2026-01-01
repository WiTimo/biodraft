import { useEffect } from 'react';
import { useCanvasState } from '../state/CanvasState';
import type { Segment, SegmentPortion } from '../state/types';

function seamPartToSegment(part: Segment | SegmentPortion): Segment {
  return Array.isArray(part) ? part : part.segment;
}

interface KeyboardShortcutOptions {
  setIsSpacePressed: (value: boolean) => void;
  isPanning: boolean;
  setIsPanning: (value: boolean) => void;
}

export function useCanvasKeyboardShortcuts({
  setIsSpacePressed,
  isPanning,
  setIsPanning,
}: KeyboardShortcutOptions) {
  const undo = useCanvasState((state) => state.undo);
  const redo = useCanvasState((state) => state.redo);
  const deleteSelectedPoint = useCanvasState((state) => state.deleteSelectedPoint);
  const deleteSelectedBackgroundImage = useCanvasState((state) => state.deleteSelectedBackgroundImage);
  const selectedBackgroundId = useCanvasState((state) => state.selectedBackgroundId);
  const selectedPointIds = useCanvasState((state) => state.selectedPointIds);
  const currentTool = useCanvasState((state) => state.currentTool);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const state = useCanvasState.getState();

      // If focus is in an input/textarea or editable element, skip global shortcuts so typing/backspace works normally
      const active = document.activeElement as HTMLElement | null;
      const isTyping = !!(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable));
      if (isTyping) return;

      if (event.code === 'Space' || event.code === 'ControlLeft') {
        setIsSpacePressed(true);
      }

      if (event.key === 'Shift') {
        state.setIsShiftPressed(true);
      }

      // Handle both AltLeft/AltRight and generic 'Alt' keys
      if (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight') {
        state.setIsAltPressed(true);
      }

      const toolKeys = {
        KeyW: 'select',
        KeyE: 'pen',
        KeyG: 'background',
        KeyS: 'seam',
      } as const;

      const selectedTool = toolKeys[event.code as keyof typeof toolKeys];
      if (selectedTool) {
        event.preventDefault();
        state.setTool(selectedTool);
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        state.setTool('select');
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();

        if (currentTool === 'seam') {
          const selectedSegment = state.selectedSeamSegment;
          if (selectedSegment) {
            const seams = state.present.seams;
            const seamPair = seams.find(([partA, partB]) => {
              const segA = seamPartToSegment(partA);
              const segB = seamPartToSegment(partB);
              const isFirstMatch = segA[0] === selectedSegment[0] && segA[1] === selectedSegment[1];
              const isSecondMatch = segB[0] === selectedSegment[0] && segB[1] === selectedSegment[1];
              return isFirstMatch || isSecondMatch;
            });

            if (seamPair) {
              const [partA, partB] = seamPair;
              state.removeSeam(seamPartToSegment(partA), seamPartToSegment(partB));
              state.setSelectedSeamSegment(null);
            }
            return;
          }
        }

        if (selectedPointIds.length > 0) {
          state.deleteSelectedPoints();
        } else {
          deleteSelectedPoint();
        }

        if (selectedBackgroundId) {
          deleteSelectedBackgroundImage();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        state.copySelectedPoints();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        state.pasteClipboardPoints();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const state = useCanvasState.getState();

      if (event.code === 'Space' || event.code === 'ControlLeft') {
        setIsSpacePressed(false);
        if (isPanning) {
          setIsPanning(false);
          document.body.style.cursor = 'default';
        }
      }

      if (event.key === 'Shift') {
        state.setIsShiftPressed(false);
      }

      if (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight') {
        state.setIsAltPressed(false);
      }
    };

    // Sometimes keyboard events can be missed (e.g., focus lost, system menus etc.)
    // Also listen to pointer events and blur/visibility to keep Alt state in sync.
    const handlePointer = (e: PointerEvent | MouseEvent) => {
      const state = useCanvasState.getState();
      // If pointer event reports altKey state different from store, sync it
      if ((e as PointerEvent).altKey !== undefined) {
        const alt = (e as PointerEvent).altKey;
        if (alt !== state.isAltPressed) state.setIsAltPressed(alt);
      }
    };

    const handleWindowBlur = () => {
      useCanvasState.getState().setIsAltPressed(false);
    };

    const handleVisibility = () => {
      if (document.hidden) useCanvasState.getState().setIsAltPressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointermove', handlePointer);
    window.addEventListener('mousemove', handlePointer);
    window.addEventListener('mousedown', handlePointer);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointermove', handlePointer);
      window.removeEventListener('mousemove', handlePointer);
      window.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    currentTool,
    deleteSelectedBackgroundImage,
    deleteSelectedPoint,
    isPanning,
    redo,
    selectedBackgroundId,
    selectedPointIds,
    setIsPanning,
    setIsSpacePressed,
    undo,
  ]);
}
