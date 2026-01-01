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

export type ValidationError = {
  key: string;
  params?: Record<string, string | number>;
};

export function validateHeight(units: 'metric' | 'imperial', valueStr: string) {
  const v = Number(valueStr);
  if (!Number.isFinite(v)) return { valid: false, error: { key: 'validation.height.number' } satisfies ValidationError };
  const cm = units === 'metric' ? v : inToCm(v);
  if (cm < 140) {
    return {
      valid: false,
      error: {
        key: 'validation.height.min',
        params: {
          value: formatNumber(units === 'metric' ? 140 : cmToIn(140)),
          unit: units === 'metric' ? 'cm' : 'in',
        },
      } satisfies ValidationError,
    };
  }
  if (cm > 210) {
    return {
      valid: false,
      error: {
        key: 'validation.height.max',
        params: {
          value: formatNumber(units === 'metric' ? 210 : cmToIn(210)),
          unit: units === 'metric' ? 'cm' : 'in',
        },
      } satisfies ValidationError,
    };
  }
  return { valid: true };
}

export function validateWeight(units: 'metric' | 'imperial', valueStr: string) {
  const v = Number(valueStr);
  if (!Number.isFinite(v)) return { valid: false, error: { key: 'validation.weight.number' } satisfies ValidationError };
  const kg = units === 'metric' ? v : lbToKg(v);
  if (kg < 40) {
    return {
      valid: false,
      error: {
        key: 'validation.weight.min',
        params: {
          value: formatNumber(units === 'metric' ? 40 : kgToLb(40)),
          unit: units === 'metric' ? 'kg' : 'lb',
        },
      } satisfies ValidationError,
    };
  }
  if (kg > 140) {
    return {
      valid: false,
      error: {
        key: 'validation.weight.max',
        params: {
          value: formatNumber(units === 'metric' ? 140 : kgToLb(140)),
          unit: units === 'metric' ? 'kg' : 'lb',
        },
      } satisfies ValidationError,
    };
  }
  return { valid: true };
}