// ---- curve helpers: arc/bulge/ellipse conversions to cubic beziers ----

export function arcToBeziers(center: { x: number; y: number }, r: number, startA: number, endA: number) {
  let delta = endA - startA;
  // normalize delta to (-2pi,2pi)
  while (delta <= -Math.PI * 2) delta += Math.PI * 2;
  while (delta > Math.PI * 2) delta -= Math.PI * 2;

  // Respect direction sign; split into segments of at most 90 degrees
  const segCount = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / segCount;
  const segs: any[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = startA + i * step;
    const b = a + step;
    const p0 = { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) };
    const p3 = { x: center.x + r * Math.cos(b), y: center.y + r * Math.sin(b) };
    const t = step;
    const k = (4 / 3) * Math.tan(t / 4) * r;
    const p1 = { x: p0.x + k * (-Math.sin(a)), y: p0.y + k * Math.cos(a) };
    const p2 = { x: p3.x + k * Math.sin(b), y: p3.y + k * -Math.cos(b) };
    segs.push({ p0, p1, p2, p3 });
  }
  return segs;
}

export function bulgeToBeziers(a: { x: number; y: number; bulge?: number }, b: { x: number; y: number }, _closed: boolean) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9) return [];
  const bulge = a.bulge ?? 0;
  const theta = 4 * Math.atan(bulge);
  if (Math.abs(theta) < 1e-6) {
    return [
      {
        p0: { x: a.x, y: a.y },
        p1: { x: (a.x * 2 + b.x) / 3, y: (a.y * 2 + b.y) / 3 },
        p2: { x: (a.x + 2 * b.x) / 3, y: (a.y + 2 * b.y) / 3 },
        p3: { x: b.x, y: b.y },
      },
    ];
  }
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const h = Math.sqrt(Math.max(0, r * r - (chord / 2) * (chord / 2)));
  // perpendicular direction
  const px = -dy / chord;
  const py = dx / chord;
  const dir = bulge >= 0 ? 1 : -1;
  const cx = mid.x + px * h * dir;
  const cy = mid.y + py * h * dir;
  const startA = Math.atan2(a.y - cy, a.x - cx);
  const endA = startA + theta;
  return arcToBeziers({ x: cx, y: cy }, r, startA, endA);
}

export function ellipseToBeziers(
  center: { x: number; y: number },
  major: { x: number; y: number },
  ratio: number,
  startParam: number,
  endParam: number
) {
  // major is vector to ellipse endpoint at parameter 0; minor vector = rotate90(major) * ratio
  const minor = { x: -major.y * ratio, y: major.x * ratio };
  const delta = endParam - startParam;
  const segCount = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const segs: any[] = [];
  for (let i = 0; i < segCount; i++) {
    const u0 = startParam + (i / segCount) * delta;
    const u1 = startParam + ((i + 1) / segCount) * delta;
    const p0 = {
      x: center.x + major.x * Math.cos(u0) + minor.x * Math.sin(u0),
      y: center.y + major.y * Math.cos(u0) + minor.y * Math.sin(u0),
    };
    const p3 = {
      x: center.x + major.x * Math.cos(u1) + minor.x * Math.sin(u1),
      y: center.y + major.y * Math.cos(u1) + minor.y * Math.sin(u1),
    };
    // derivatives w.r.t parameter u
    const d0 = {
      x: -major.x * Math.sin(u0) + minor.x * Math.cos(u0),
      y: -major.y * Math.sin(u0) + minor.y * Math.cos(u0),
    };
    const d1 = {
      x: -major.x * Math.sin(u1) + minor.x * Math.cos(u1),
      y: -major.y * Math.sin(u1) + minor.y * Math.cos(u1),
    };
    const du = u1 - u0;
    const p1 = { x: p0.x + d0.x * (du / 3), y: p0.y + d0.y * (du / 3) };
    const p2 = { x: p3.x - d1.x * (du / 3), y: p3.y - d1.y * (du / 3) };
    segs.push({ p0, p1, p2, p3 });
  }
  return segs;
}
