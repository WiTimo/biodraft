import type { CanvasStateCreator, SeamSlice, Segment, SegmentSeam } from '../types';
import { normalizeSegment, seamsEqual, segmentsEqual } from '../utils';

export const createSeamSlice: CanvasStateCreator<SeamSlice> = (set, get, _api) => ({
  seams: [],
  seamSelection: [],
  selectedSeamSegment: null,
  pendingSeamPortion1: null,
  pendingSeamPortion2: null,

  setSeamSelection: (selection) => set({ seamSelection: selection }),
  setSelectedSeamSegment: (segment) => set({ selectedSeamSegment: segment }),

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
        const seg1 = (existing[0] as any).segment || existing[0];
        const seg2 = (existing[1] as any).segment || existing[1];
        return seamsEqual([seg1, seg2] as SegmentSeam, [pendingSeamPortion1.segment, pendingSeamPortion2.segment]);
      });
      
      if (exists) {
        return {
          ...state,
          pendingSeamPortion1: null,
          pendingSeamPortion2: null,
        };
      }

      return {
        present: {
          ...state.present,
          seams: [...state.present.seams, newSeam],
        },
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
        
        // Handle both SegmentPortion and Segment types
        const normA = normalizeSegment(portionA.segment || portionA);
        const normB = normalizeSegment(portionB.segment || portionB);

        if (segmentsEqual(normA, target)) {
          // Swap segB
          if (portionB.segment) {
            // It's a SegmentPortion - swap tStart and tEnd
            return [segA, { segment: portionB.segment, tStart: portionB.tEnd, tEnd: portionB.tStart }] as SegmentSeam;
          } else {
            // It's a regular Segment
            return [segA, [portionB[1], portionB[0]]] as SegmentSeam;
          }
        }

        if (segmentsEqual(normB, target)) {
          // Swap segA
          if (portionA.segment) {
            // It's a SegmentPortion - swap tStart and tEnd
            return [{ segment: portionA.segment, tStart: portionA.tEnd, tEnd: portionA.tStart }, segB] as SegmentSeam;
          } else {
            // It's a regular Segment
            return [[portionA[1], portionA[0]], segB] as SegmentSeam;
          }
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
        // Swap the direction of portion2 by swapping tStart and tEnd
        const swappedPortion2 = {
          segment: portion2.segment,
          tStart: portion2.tEnd,
          tEnd: portion2.tStart,
        };

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
      updated[seamIndex] = [portion1, [portion2[1], portion2[0]]];

      return {
        present: {
          ...state.present,
          seams: updated,
        },
      };
    });
  },
});