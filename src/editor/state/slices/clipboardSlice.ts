import type { CanvasStateCreator, ClipboardSlice, Path } from '../types';
import { getFrontBackSplitX, inferPatternSideFromPath } from '../../utils/importExport/shared';

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

      const clonePoints = () => {
        try {
          const sc = globalThis.structuredClone;
          if (typeof sc === 'function') return sc(selectedPoints);
        } catch {
          // ignore
        }
        return JSON.parse(JSON.stringify(selectedPoints)) as typeof selectedPoints;
      };

      return {
        id: crypto.randomUUID(),
        closed: isFullySelected ? path.closed : false,
        points: clonePoints(),
        texture: isFullySelected ? path.texture ?? null : null,
      } satisfies Path;
    });

    set({ clipboard: copiedPaths });
  },

  pasteClipboardPoints: () => {
    const { clipboard, present, saveState } = get();
    if (!clipboard || clipboard.length === 0) return;

    const offsetAmount = 0;
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

  // Pattern-level clipboard (stores a full Path clone to copy transform/texture/position)
  patternClipboard: null,

  copyPatternValues: (pathId: string) => {
    const { present } = get();
    const path = present.paths.find((p) => p.id === pathId);
    if (!path) return;

    // Deep clone path
    let cloned: Path;
    try {
      const sc = globalThis.structuredClone;
      if (typeof sc === 'function') cloned = sc(path) as Path;
      else cloned = JSON.parse(JSON.stringify(path)) as Path;
    } catch {
      cloned = JSON.parse(JSON.stringify(path)) as Path;
    }

    set({ patternClipboard: cloned });
  },

  pastePatternValues: (targetPathId: string, mode: 'front' | 'back') => {
    const { patternClipboard, present, saveState, manImageCenters } = get();
    if (!patternClipboard) return;

    const source = patternClipboard;
    const targetIndex = present.paths.findIndex((p) => p.id === targetPathId);
    if (targetIndex === -1) return;

    // Helper to compute centroid
    const centroid = (p: Path) => {
      if (!p.points || p.points.length === 0) return { x: 0, y: 0 };
      const sx = p.points.reduce((s, pt) => s + pt.x, 0);
      const sy = p.points.reduce((s, pt) => s + pt.y, 0);
      return { x: sx / p.points.length, y: sy / p.points.length };
    };

    const srcCent = centroid(source);
    const tgtCent = centroid(present.paths[targetIndex]);

    // Determine front/back split and whether we need to mirror across it
    const splitX = getFrontBackSplitX({ manImageCenters, backgroundImages: present.backgroundImages });

    const srcSide = inferPatternSideFromPath(source, splitX);
    const desiredSide = mode;

    // If the source is on the opposite side to the desired mode, mirror the X coordinate across the split line
    let desiredSrcCent = { ...srcCent };
    if (srcSide !== desiredSide) {
      desiredSrcCent.x = 2 * splitX - srcCent.x;
    }

    const dx = desiredSrcCent.x - tgtCent.x;
    const dy = desiredSrcCent.y - tgtCent.y;

    // Update the target path's points by translating them, and copy texture values
    const updatedTarget: Path = {
      ...present.paths[targetIndex],
      points: present.paths[targetIndex].points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy })),
      texture: source.texture ? (JSON.parse(JSON.stringify(source.texture)) as Path['texture']) : present.paths[targetIndex].texture,
    };

    // Reorder: place updated target within the desired side grouping
    const withoutTarget = present.paths.filter((p) => p.id !== targetPathId);

    // Find positions of paths that are on the desired side
    const sidePositions = withoutTarget
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => inferPatternSideFromPath(p, splitX) === desiredSide)
      .map(({ i }) => i);

    let newPaths: Path[] = [];

    if (sidePositions.length > 0) {
      // Insert after the last path on that side
      const insertAt = Math.min(withoutTarget.length, Math.max(...sidePositions) + 1);
      withoutTarget.splice(insertAt, 0, updatedTarget);
      newPaths = withoutTarget;
    } else {
      // No paths on that side -> fallback to start/end depending on mode
      if (desiredSide === 'front') {
        newPaths = [...withoutTarget, updatedTarget];
      } else {
        newPaths = [updatedTarget, ...withoutTarget];
      }
    }

    const newSelectedPointIds = updatedTarget.points.map((pt) => pt.id);

    saveState();
    set({
      present: {
        ...present,
        paths: newPaths,
      },
      selectedPointIds: newSelectedPointIds,
      selectedPointId: newSelectedPointIds.length === 1 ? newSelectedPointIds[0] : null,
    });
  },
});
