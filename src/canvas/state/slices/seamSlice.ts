import type { CanvasStateCreator, SeamSlice, Segment, SegmentSeam } from '../types';
import { normalizeSegment, seamsEqual, segmentsEqual } from '../utils';

export const createSeamSlice: CanvasStateCreator<SeamSlice> = (set, get, _api) => ({
  seams: [],
  seamSelection: [],
  selectedSeamSegment: null,

  setSeamSelection: (selection) => set({ seamSelection: selection }),
  setSelectedSeamSegment: (segment) => set({ selectedSeamSegment: segment }),

  addSeam: (segmentA, segmentB) => {
    set((state) => {
      const newSeam: SegmentSeam = [segmentA, segmentB];
      const exists = state.present.seams.some((existing) => seamsEqual(existing, newSeam));
      if (exists) return state;

      return {
        present: {
          ...state.present,
          seams: [...state.present.seams, newSeam],
        },
      };
    });
  },

  removeSeam: (seg1, seg2) => {
    set((state) => ({
      present: {
        ...state.present,
        seams: state.present.seams.filter((existing) => !seamsEqual(existing, [seg1, seg2])),
      },
    }));
  },

  isSeam: (seg1, seg2) => {
    return get().present.seams.some((existing) => seamsEqual(existing, [seg1, seg2]));
  },

  addPathSeam: (seg1, seg2) => {
    set((state) => ({
      present: {
        ...state.present,
        seams: [...state.present.seams, [seg1, seg2]],
      },
    }));
  },

  swapSeam: (clickedSeg: Segment) => {
    set((state) => {
      const target = normalizeSegment(clickedSeg);

      const updated = state.present.seams.map(([segA, segB]) => {
        const normA = normalizeSegment(segA);
        const normB = normalizeSegment(segB);

        if (segmentsEqual(normA, target)) {
          return [segA, [segB[1], segB[0]]] as SegmentSeam;
        }

        if (segmentsEqual(normB, target)) {
          return [[segA[1], segA[0]], segB] as SegmentSeam;
        }

        return [segA, segB] as SegmentSeam;
      });

      return {
        present: {
          ...state.present,
          seams: updated,
        },
      };
    });
  },
});
