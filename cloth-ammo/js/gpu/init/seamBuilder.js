// js/init/seamBuilder.js

export function buildSeams(patternSeams, halves, ids0, AptsLength, addSpring) {
  const seamDebugPairs = [];

  function getIdx(pid, half) {
    const po = half.original.find(p => p.id === pid);
    const np = half.norm(po);
    let best = 0, d2 = Infinity;
    half.boundary.forEach((v, i) => {
      const dd = (v.x - np.x)**2 + (v.y - np.y)**2;
      if (dd < d2) { d2 = dd; best = i; }
    });
    return best;
  }

  function seqFn(s, e, N) {
  // guard against bad N
  if (typeof N !== 'number' || N <= 0) return [];

  // walk forward from s to e
  const f = [];
  for (let i = s; ; i = (i + 1) % N) {
    f.push(i);
    if (i === e) break;
  }

  // walk backward from s to e
  const b = [];
  for (let i = s; ; i = (i - 1 + N) % N) {
    b.push(i);
    if (i === e) break;
  }

  // return the shorter path
  return f.length <= b.length ? f : b;
}


  function resamp(arr, T) {
    return Array.from({ length: T }, (_, k) => arr[Math.floor(k * arr.length / T)]);
  }

  for (const seam of patternSeams) {
    const [a, b] = seam;
    const halfA = ids0.has(a[0]) ? a : b;
    const halfB = ids0.has(a[0]) ? b : a;

    let s0 = seqFn(getIdx(halfA[0], halves[0]), getIdx(halfA[1], halves[0]), halves[0].boundary.length);
    let s1 = seqFn(getIdx(halfB[0], halves[1]), getIdx(halfB[1], halves[1]), halves[1].boundary.length);

    const L = Math.max(s0.length, s1.length);
    if (s0.length !== L) s0 = resamp(s0, L);
    if (s1.length !== L) s1 = resamp(s1, L);

    for (let k = 0; k < L; k++) {
      const i0 = s0[k], 
            i1 = s1[k] + AptsLength;
      addSpring(i0, i1);
      seamDebugPairs.push([i0, i1]);
    }
  }

  return seamDebugPairs;
}
