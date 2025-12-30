import type { CanvasStateCreator, TextureSlice } from '../types';

export const createTextureSlice: CanvasStateCreator<TextureSlice> = (set, get, _api) => ({
  setTextureForPath: (pathId, texture) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        paths: present.paths.map((path) =>
          path.id === pathId ? { ...path, texture } : path,
        ),
      },
    });
  },

  clearTextureForPath: (pathId) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        paths: present.paths.map((path) =>
          path.id === pathId ? { ...path, texture: null } : path,
        ),
      },
    });
  },

  setTextureForSelectedPaths: (texture) => {
    const { selectedPointIds, present, saveState } = get();
    const selectedPathIds = new Set<string>();

    for (const path of present.paths) {
      if (path.points.some((point) => selectedPointIds.includes(point.id))) {
        selectedPathIds.add(path.id);
      }
    }

    if (selectedPathIds.size === 0) return;

    saveState();
    set({
      present: {
        ...present,
        paths: present.paths.map((path) =>
          selectedPathIds.has(path.id) ? { ...path, texture } : path,
        ),
      },
    });
  },

  updateTextureForPathLive: (pathId, partial) => {
    const { present } = get();
    set({
      present: {
        ...present,
        paths: present.paths.map((path) => {
          if (path.id !== pathId) return path;
          const base = path.texture ?? { src: '' };
          return { ...path, texture: { ...base, ...partial } };
        }),
      },
    });
  },

  // Kept for backwards-compat. History snapshots should be managed at the gesture level
  // (e.g. drag start / wheel burst) instead of per-mousemove.
  updateTextureForPath: (pathId, partial) => {
    const { updateTextureForPathLive } = get();
    updateTextureForPathLive(pathId, partial);
  },
});
