export let patternData = null;

function clonePatternPayload(payload) {
  try {
    return structuredClone(payload);
  } catch (_err) {
    try {
      return JSON.parse(JSON.stringify(payload));
    } catch (jsonErr) {
      console.warn('Failed to clone pattern payload:', jsonErr);
      return null;
    }
  }
}

export function setPatternData(payload) {
  if (!payload || !Array.isArray(payload.patterns)) {
    console.warn('Ignoring pattern payload without patterns array.');
    return null;
  }

  const safePayload = clonePatternPayload({
    seams: Array.isArray(payload.seams) ? payload.seams : [],
    patterns: payload.patterns
  });

  if (!safePayload) return null;

  const toFinite = (value, fallback = 0) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
  };

  const normaliseHandles = (handle) => ({
    dx: toFinite(handle?.dx, 0),
    dy: toFinite(handle?.dy, 0)
  });

  const normaliseTexture = (tex) => {
    if (!tex || typeof tex !== 'object') return null;
    return {
      src: typeof tex.src === 'string' ? tex.src : undefined,
      scaleX: toFinite(tex.scaleX, 1),
      scaleY: toFinite(tex.scaleY, 1),
      offsetX: toFinite(tex.offsetX, 0),
      offsetY: toFinite(tex.offsetY, 0),
      rotation: toFinite(tex.rotation, 0),
      repeat: typeof tex.repeat === 'string' ? tex.repeat : 'repeat'
    };
  };

  const normalisePattern = (pattern) => {
    if (!pattern || typeof pattern !== 'object' || !Array.isArray(pattern.points)) return null;
    const points = pattern.points
      .map((point) => {
        if (!point || typeof point !== 'object') return null;
        const id = typeof point.id === 'string' ? point.id : null;
        const x = toFinite(point.x, null);
        const y = toFinite(point.y, null);
        if (!id || x === null || y === null) return null;
        return {
          id,
          x,
          y,
          handleIn: normaliseHandles(point.handleIn),
          handleOut: normaliseHandles(point.handleOut)
        };
      })
      .filter(Boolean);

    if (points.length < 3) return null;

    const texture = normaliseTexture(pattern.texture);

    return {
      id: typeof pattern.id === 'string' ? pattern.id : points[0].id,
      points,
      closed: Boolean(pattern.closed),
      texture
    };
  };

  const normalisedPatterns = safePayload.patterns
    .map(normalisePattern)
    .filter(Boolean);

  if (normalisedPatterns.length === 0) {
    console.warn('Ignoring pattern payload with no valid shapes.');
    return null;
  }

  const validPointIds = new Set();
  normalisedPatterns.forEach((pattern) => {
    pattern.points.forEach((point) => validPointIds.add(point.id));
  });

  const normalisedSeams = safePayload.seams
    .filter((seam) =>
      Array.isArray(seam) &&
      seam.length === 2 &&
      seam.every((pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        pair.every((pointId) => typeof pointId === 'string' && validPointIds.has(pointId))
      )
    );

  patternData = {
    patterns: normalisedPatterns,
    seams: normalisedSeams
  };

  return patternData;
}

export function getPatternData() {
  return patternData;
}

export async function loadConfig(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!setPatternData(data)) throw new Error('Fetched cloth config was invalid.');
  } catch (err) {
    console.warn('Failed to load cloth config at', path, '- using built-in fallback. Error:', err);
    // Minimal fallback: two small rectangles and no seams; allows app to start without external file
    patternData = {
      patterns: [
        {
          id: 'fallback-front',
          points: [
            { id: 'f0', x: -0.25, y: -0.25 },
            { id: 'f1', x:  0.25, y: -0.25 },
            { id: 'f2', x:  0.25, y:  0.25 },
            { id: 'f3', x: -0.25, y:  0.25 }
          ],
          closed: true
        },
        {
          id: 'fallback-back',
          points: [
            { id: 'b0', x: -0.25, y: -0.25 },
            { id: 'b1', x:  0.25, y: -0.25 },
            { id: 'b2', x:  0.25, y:  0.25 },
            { id: 'b3', x: -0.25, y:  0.25 }
          ],
          closed: true
        }
      ],
      seams: []
    };
  }
}
