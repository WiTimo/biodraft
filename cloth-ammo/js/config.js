export let patternData = null;

// If data comes from the parent window use it, otherwise load the default config
export async function loadConfig(path = './patterns_with_seams.json', data = null) {
  console.log(data)
  if(data) {
    patternData = data; 
    return;
  }
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  patternData = await res.json();
}
