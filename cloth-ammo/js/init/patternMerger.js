// js/init/patternMerger.js

export function mergeHalves(halves) {
  const Apts = halves[0].pts2D;
  const Bpts = halves[1].pts2D;
  const idxA = halves[0].idx;
  const idxB = halves[1].idx.map(i => i + Apts.length);
  const globalIdx = idxA.concat(idxB);
  return { Apts, Bpts, globalIdx };
}
