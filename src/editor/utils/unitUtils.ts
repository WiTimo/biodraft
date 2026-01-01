export function cmToIn(cm: number) {
  return cm / 2.54;
}

export function inToCm(inches: number) {
  return inches * 2.54;
}

export function kgToLb(kg: number) {
  return kg * 2.2046226218;
}

export function lbToKg(lb: number) {
  return lb / 2.2046226218;
}

export function formatNumber(n: number, decimals = 2) {
  if (!Number.isFinite(n)) return '';
  const s = n.toFixed(decimals);
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

export function validateHeight(units: 'metric' | 'imperial', valueStr: string) {
  const v = Number(valueStr);
  if (!Number.isFinite(v)) return { valid: false, error: 'Height must be a number' };
  const cm = units === 'metric' ? v : inToCm(v);
  if (cm < 140) return { valid: false, error: `Height must be at least ${formatNumber(units === 'metric' ? 140 : cmToIn(140))} ${units === 'metric' ? 'cm' : 'in'}` };
  if (cm > 210) return { valid: false, error: `Height must be at most ${formatNumber(units === 'metric' ? 210 : cmToIn(210))} ${units === 'metric' ? 'cm' : 'in'}` };
  return { valid: true };
}

export function validateWeight(units: 'metric' | 'imperial', valueStr: string) {
  const v = Number(valueStr);
  if (!Number.isFinite(v)) return { valid: false, error: 'Weight must be a number' };
  const kg = units === 'metric' ? v : lbToKg(v);
  if (kg < 40) return { valid: false, error: `Weight must be at least ${formatNumber(units === 'metric' ? 40 : kgToLb(40))} ${units === 'metric' ? 'kg' : 'lb'}` };
  if (kg > 140) return { valid: false, error: `Weight must be at most ${formatNumber(units === 'metric' ? 140 : kgToLb(140))} ${units === 'metric' ? 'kg' : 'lb'}` };
  return { valid: true };
}