export function getStep(raw: number): number {
  if (raw <= 0) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exponent);
  const fraction = raw / base;

  let factor: number;
  if (fraction < 1.5) factor = 1;
  else if (fraction < 3) factor = 2;
  else if (fraction < 7) factor = 5;
  else factor = 10;

  return factor * base;
}

export function formatRulerNumber(n: number): string {
  if (Math.abs(n) >= 1) return Math.round(n).toString();
  return n.toFixed(2);
}
