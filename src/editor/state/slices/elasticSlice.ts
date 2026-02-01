import type { CanvasStateCreator, ElasticSlice, Segment } from '../types';
import { normalizeSegment, segmentsEqual } from '../utils';

export const createElasticSlice: CanvasStateCreator<ElasticSlice> = (set, get, _api) => ({
  toggleElasticEdge: (segment: Segment) => {
    const { present, saveState } = get();
    // fallbacks in case we load old state without the array
    const elasticEdges = present.elasticEdges || [];
    const normalized = normalizeSegment(segment);

    const exists = elasticEdges.some(e => segmentsEqual(e, normalized));
    
    saveState();

    if (exists) {
      set({
        present: {
          ...present,
          elasticEdges: elasticEdges.filter(e => !segmentsEqual(e, normalized)),
        },
      });
    } else {
      set({
        present: {
          ...present,
          elasticEdges: [...elasticEdges, normalized],
        },
      });
    }
  },

  isElasticEdge: (segment: Segment) => {
    const { present } = get();
    const elasticEdges = present.elasticEdges || [];
    const normalized = normalizeSegment(segment);
    return elasticEdges.some(e => segmentsEqual(e, normalized));
  },
});
