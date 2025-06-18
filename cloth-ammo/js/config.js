export let patternData = null;

export async function loadConfig(path = './patterns_with_seams.json') {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  patternData = await res.json();
}
