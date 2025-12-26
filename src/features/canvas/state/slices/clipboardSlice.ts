import type { CanvasStateCreator, ClipboardSlice, Path } from '../types';

export const createClipboardSlice: CanvasStateCreator<ClipboardSlice> = (set, get, _api) => ({
  clipboard: null,
  setClipboard: (paths) => set({ clipboard: paths }),

  copySelectedPoints: () => {
    const { selectedPointIds, present } = get();
    if (selectedPointIds.length === 0) return;

    const matchingPaths = present.paths.filter((path) =>
      path.points.some((point) => selectedPointIds.includes(point.id)),
    );

    const copiedPaths = matchingPaths.map((path) => {
      const selectedPoints = path.points.filter((point) => selectedPointIds.includes(point.id));
      const isFullySelected = selectedPoints.length === path.points.length;

      return {
        id: crypto.randomUUID(),
        closed: isFullySelected ? path.closed : false,
        points: JSON.parse(JSON.stringify(selectedPoints)),
        texture: isFullySelected ? path.texture ?? null : null,
      } satisfies Path;
    });

    set({ clipboard: copiedPaths });
  },

  pasteClipboardPoints: () => {
    const { clipboard, present, saveState } = get();
    if (!clipboard || clipboard.length === 0) return;

    const offsetAmount = 30;
    const newPaths = clipboard.map((path) => {
      const newPoints = path.points.map((point) => ({
        ...point,
        id: crypto.randomUUID(),
        x: point.x + offsetAmount,
        y: point.y + offsetAmount,
      }));

      return {
        id: crypto.randomUUID(),
        closed: path.closed,
        points: newPoints,
        texture: path.texture ?? null,
      } satisfies Path;
    });

    const allNewPointIds = newPaths.flatMap((path) => path.points.map((point) => point.id));

    saveState();
    set({
      present: {
        ...present,
        paths: [...present.paths, ...newPaths],
      },
      selectedPointIds: allNewPointIds,
      selectedPointId: allNewPointIds.length === 1 ? allNewPointIds[0] : null,
    });
  },
});