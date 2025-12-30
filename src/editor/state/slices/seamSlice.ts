import type { CanvasStateCreator, SeamSlice, Segment, SegmentSeam } from '../types';
import { normalizeSegment, seamsEqual, segmentsEqual } from '../utils';

function seamPartToSegment(part: any): Segment {
  return (part && (part as any).segment) ? (part as any).segment : (part as Segment);
}

function reverseSeamPart(part: any): any {
  if (part && (part as any).segment) {
    return { segment: (part as any).segment, tStart: (part as any).tEnd, tEnd: (part as any).tStart };
  }
  const seg = part as Segment;
  return [seg[1], seg[0]] as Segment;
}

export const createSeamSlice: CanvasStateCreator<SeamSlice> = (set, get, _api) => ({
  seams: [],
  seamSelection: [],
  selectedSeamSegment: null,
  seamDeleteMode: false,
  pendingSeamPortion1: null,
  pendingSeamPortion2: null,

  setSeamSelection: (selection) => set({ seamSelection: selection }),
  setSelectedSeamSegment: (segment) => set({ selectedSeamSegment: segment }),
  setSeamDeleteMode: (active) => set({ seamDeleteMode: active }),

  setPendingSeamPortion1: (portion) => set({ pendingSeamPortion1: portion }),
  setPendingSeamPortion2: (portion) => set({ pendingSeamPortion2: portion }),
  
  clearPendingSeamPortions: () => set({
    pendingSeamPortion1: null,
    pendingSeamPortion2: null,
  }),

  commitPendingSeamPortions: () => {
    const { pendingSeamPortion1, pendingSeamPortion2, saveState } = get();
    
    if (!pendingSeamPortion1 || !pendingSeamPortion2) return;

    saveState();

    // Create a portion-based seam with t-values
    set((state) => {
      const newSeam: SegmentSeam = [pendingSeamPortion1, pendingSeamPortion2];
      
      // Check if seam already exists (compare segments only for now)
      const exists = state.present.seams.some((existing) => {
        const seg1 = seamPartToSegment(existing[0]);
        const seg2 = seamPartToSegment(existing[1]);
        return seamsEqual([seg1, seg2] as SegmentSeam, [pendingSeamPortion1.segment, pendingSeamPortion2.segment]);
      });
      
      if (exists) {
        return {
          ...state,
          seamDeleteMode: false,
          pendingSeamPortion1: null,
          pendingSeamPortion2: null,
        };
      }

      return {
        present: {
          ...state.present,
          seams: [...state.present.seams, newSeam],
        },
        seamDeleteMode: false,
        pendingSeamPortion1: null,
        pendingSeamPortion2: null,
      };
    });
  },

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
        const portionA = segA as any;
        const portionB = segB as any;

        const normA = normalizeSegment(seamPartToSegment(portionA));
        const normB = normalizeSegment(seamPartToSegment(portionB));

        if (segmentsEqual(normA, target)) {
          return [segA, reverseSeamPart(segB)] as SegmentSeam;
        }

        if (segmentsEqual(normB, target)) {
          return [reverseSeamPart(segA), segB] as SegmentSeam;
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

  swapSeamPortion: (seamIndex: number) => {
    set((state) => {
      const seam = state.present.seams[seamIndex];
      if (!seam) return state;

      const portion1 = seam[0] as any;
      const portion2 = seam[1] as any;

      // Check if it's a portion-based seam
      const isPortionSeam = portion1.segment && portion1.tStart !== undefined;

      if (isPortionSeam) {
        const swappedPortion2 = reverseSeamPart(portion2);

        const updated = [...state.present.seams];
        updated[seamIndex] = [portion1, swappedPortion2];

        return {
          present: {
            ...state.present,
            seams: updated,
          },
        };
      }

      // For old-style seams, swap segment2
      const updated = [...state.present.seams];
      updated[seamIndex] = [portion1, reverseSeamPart(portion2)];

      return {
        present: {
          ...state.present,
          seams: updated,
        },
      };
    });
  },
});
