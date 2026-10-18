/** Decimals that show a price with ~4 significant digits (4..9). */
export function priceDecimals(p: number): number {
  if (!isFinite(p) || p <= 0) return 6;
  return Math.max(4, Math.min(9, Math.ceil(-Math.log10(p)) + 4));
}

export function fmtPrice(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "–";
  const n = typeof s === "string" ? parseFloat(s) : s;
  if (!isFinite(n)) return "–";
  return n.toFixed(priceDecimals(n));
}

/** Compact number: 1.234K, 5.6M, 7.8B. */
export function fmtNum(s: string | number | null | undefined, digits = 3): string {
  if (s === null || s === undefined) return "–";
  const n = typeof s === "string" ? parseFloat(s) : s;
  if (!isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(digits) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(digits) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(digits) + "K";
  return n.toFixed(digits);
}
