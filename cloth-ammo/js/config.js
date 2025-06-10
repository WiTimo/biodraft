export let patternData = null;
export let normalizePoint = null;

export async function loadConfig(path = './patterns_with_seams.json') {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    patternData = await res.json();

    // compute global bounds & normalization
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let pat of patternData.patterns) {
      for (let pt of pat.points) {
        minX = Math.min(minX, pt.x);
        maxX = Math.max(maxX, pt.x);
        minY = Math.min(minY, pt.y);
        maxY = Math.max(maxY, pt.y);
      }
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const scl = 1 / Math.max(maxX - minX, maxY - minY);
    normalizePoint = p => ({ x: (p.x - cx) * scl, y: (p.y - cy) * scl });
  } catch (e) {
    console.error('Failed to load patterns:', e);
    throw e;
  }
}
