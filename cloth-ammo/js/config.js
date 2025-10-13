import { SETTINGS } from "../settings.js";

export let patternData = null;

let resolvePatternData;
const patternDataReady = new Promise((resolve) => {
  resolvePatternData = resolve;
});

const FALLBACK_PATTERN_DATA = {
  patterns: [
    {
      id: "fallback-front",
      points: [
        { id: "f0", x: -0.25, y: -0.25 },
        { id: "f1", x: 0.25, y: -0.25 },
        { id: "f2", x: 0.25, y: 0.25 },
        { id: "f3", x: -0.25, y: 0.25 }
      ],
      closed: true
    },
    {
      id: "fallback-back",
      points: [
        { id: "b0", x: -0.25, y: -0.25 },
        { id: "b1", x: 0.25, y: -0.25 },
        { id: "b2", x: 0.25, y: 0.25 },
        { id: "b3", x: -0.25, y: 0.25 }
      ],
      closed: true
    }
  ],
  seams: []
};

function sanitizePatternData(raw) {
  if (!raw || !Array.isArray(raw.patterns)) {
    return null;
  }

  const validPatterns = raw.patterns
    .map((pattern) => {
      const safePoints = Array.isArray(pattern.points)
        ? pattern.points.filter(
            (pt) =>
              pt &&
              typeof pt.x === "number" &&
              typeof pt.y === "number" &&
              Number.isFinite(pt.x) &&
              Number.isFinite(pt.y)
          )
        : [];

      return {
        ...pattern,
        points: safePoints
      };
    })
    .filter((pattern) => pattern.points.length >= 3);

  if (validPatterns.length === 0) {
    return null;
  }

  const patternsByArea = validPatterns
    .map((pattern) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const point of pattern.points) {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
      }

      const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
      return { pattern, area };
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, 2)
    .map(({ pattern }) => pattern);

  if (patternsByArea.length < 2) {
    return null;
  }

  const validPointIds = new Set();
  for (const pattern of patternsByArea) {
    for (const point of pattern.points) {
      if (point?.id) {
        validPointIds.add(point.id);
      }
    }
  }

  const safeSeams = Array.isArray(raw.seams)
    ? raw.seams.filter((pair) => {
        if (!Array.isArray(pair) || pair.length !== 2) return false;
        return pair.every(
          (edge) =>
            Array.isArray(edge) &&
            edge.length === 2 &&
            edge.every((id) => typeof id === "string" && validPointIds.has(id))
        );
      })
    : [];

  return {
    ...raw,
    patterns: patternsByArea,
    seams: safeSeams
  };
}

function setPatternData(data) {
  const sanitized = sanitizePatternData(data);
  if (!sanitized) {
    console.warn("Received invalid cloth pattern data; using fallback cloth.");
    patternData = FALLBACK_PATTERN_DATA;
  } else {
    patternData = sanitized;
  }

  if (resolvePatternData) {
    resolvePatternData(patternData);
    resolvePatternData = null;
  }
}

export function waitForPatternData() {
  return patternData ? Promise.resolve(patternData) : patternDataReady;
}

window.addEventListener("message", (event) => {
  const message = event?.data;
  if (!message?.type) return;
  if (message.type === "setClothPattern") {
    setPatternData(message.payload);
  }
});

export async function loadConfig(path) {
  if (!SETTINGS.useDefaultCloth) {
    return waitForPatternData();
  }

  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setPatternData(await res.json());
  } catch (err) {
    console.warn('Failed to load cloth config at', path, '- using built-in fallback. Error:', err);
    // Minimal fallback: two small rectangles and no seams; allows app to start without external file
    setPatternData(FALLBACK_PATTERN_DATA);
  }

  return patternData;
}
