import type { BackgroundSlice, CanvasStateCreator } from '../types';

export const createBackgroundSlice: CanvasStateCreator<BackgroundSlice> = (set, get, _api) => ({
  selectedBackgroundId: null,

  addBackgroundImage: (src, id, nativeWidth, nativeHeight) => {
    const { present, saveState } = get();
    saveState();
    const newImage = {
      id: id ?? crypto.randomUUID(),
      src,
      x: 100,
      y: 100,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 0.4,
      locked: false,
      nativeWidth,
      nativeHeight,
    };

    set({
      present: {
        ...present,
        backgroundImages: [...present.backgroundImages, newImage],
      },
    });
  },

  moveBackgroundImage: (id, x, y) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.map((img) =>
          img.id === id ? { ...img, x, y } : img,
        ),
      },
    });
  },

  scaleBackgroundImage: (id, scale) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.map((img) =>
          img.id === id ? { ...img, scaleX: scale, scaleY: scale } : img,
        ),
      },
    });
  },

  rotateBackgroundImage: (id, rotation) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.map((img) =>
          img.id === id ? { ...img, rotation } : img,
        ),
      },
    });
  },

  toggleLockBackgroundImage: (id) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.map((img) =>
          img.id === id ? { ...img, locked: !img.locked } : img,
        ),
      },
    });
  },

  selectBackgroundImage: (id) => {
    // Bring the selected image to the front (rendered last) so it's accessible
    const { present } = get();
    const existing = present.backgroundImages.find((img) => img.id === id);
    if (!existing) {
      set({ selectedBackgroundId: id });
      return;
    }
    const others = present.backgroundImages.filter((img) => img.id !== id);
    const reordered = [...others, existing];
    set({ present: { ...present, backgroundImages: reordered }, selectedBackgroundId: id });
  },
  deselectBackgroundImages: () => set({ selectedBackgroundId: null }),

  updateBackgroundImageTransform: (id, { scaleX, scaleY, rotation }) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.map((img) =>
          img.id === id ? { ...img, scaleX, scaleY, rotation } : img,
        ),
      },
    });
  },

  updateBackgroundImageFullTransform: (id, { x, y, scaleX, scaleY, rotation }) => {
    const { present, saveState } = get();
    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.map((img) =>
          img.id === id
            ? { ...img, x, y, scaleX, scaleY, rotation }
            : img,
        ),
      },
    });
  },

  deleteSelectedBackgroundImage: () => {
    const { selectedBackgroundId, present, saveState } = get();
    if (!selectedBackgroundId) return;

    saveState();
    set({
      present: {
        ...present,
        backgroundImages: present.backgroundImages.filter((img) => img.id !== selectedBackgroundId),
      },
      selectedBackgroundId: null,
    });
  },

  removeBackgroundImage: (id) => {
    set((state) => ({
      present: {
        ...state.present,
        backgroundImages: state.present.backgroundImages.filter((img) => img.id !== id),
      },
    }));
  },
});