export type Arr = Float64Array;

const nan = (n: number) => new Float64Array(n).fill(NaN);

export function sma(x: Arr, len: number): Arr {
  const out = nan(x.length);
  for (let i = len - 1; i < x.length; i++) {
    let s = 0;
    for (let k = 0; k < len; k++) s += x[i - k];
    out[i] = s / len;
  }
  return out;
}

function smoothed(x: Arr, len: number, alpha: number): Arr {
  const out = nan(x.length);
  let prev = NaN, run = 0, acc = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (Number.isNaN(v)) { run = 0; acc = 0; continue; }
    if (Number.isNaN(prev)) {
      run++; acc += v;
      if (run > len) { acc -= x[i - len]; run = len; }
      if (run === len) { prev = acc / len; out[i] = prev; }
      continue;
    }
    prev = alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

export const ema = (x: Arr, len: number) => smoothed(x, len, 2 / (len + 1));
export const rma = (x: Arr, len: number) => smoothed(x, len, 1 / len);

export function wma(x: Arr, len: number): Arr {
  const out = nan(x.length), den = (len * (len + 1)) / 2;
  for (let i = len - 1; i < x.length; i++) {
    let num = 0;
    for (let k = 0; k < len; k++) num += x[i - k] * (len - k);
    out[i] = num / den;
  }
  return out;
}

export function hma(x: Arr, len: number): Arr {
  const half = wma(x, Math.max(1, Math.floor(len / 2))), full = wma(x, len);
  return wma(map2(half, full, (a, b) => 2 * a - b), Math.max(1, Math.floor(Math.sqrt(len))));
}

export function stdev(x: Arr, len: number): Arr {
  const mean = sma(x, len), out = nan(x.length);
  for (let i = len - 1; i < x.length; i++) {
    const m = mean[i];
    if (Number.isNaN(m)) continue;
    let s = 0;
    for (let k = 0; k < len; k++) s += (x[i - k] - m) ** 2;
    out[i] = Math.sqrt(s / len);
  }
  return out;
}

export function meanDev(x: Arr, len: number): Arr {
  const mean = sma(x, len), out = nan(x.length);
  for (let i = len - 1; i < x.length; i++) {
    const m = mean[i];
    if (Number.isNaN(m)) continue;
    let s = 0;
    for (let k = 0; k < len; k++) s += Math.abs(x[i - k] - m);
    out[i] = s / len;
  }
  return out;
}

function extreme(x: Arr, len: number, hi: boolean): Arr {
  const out = nan(x.length);
  for (let i = len - 1; i < x.length; i++) {
    let m = hi ? -Infinity : Infinity;
    for (let k = 0; k < len; k++) { const v = x[i - k]; if (Number.isNaN(v)) { m = NaN; break; } m = hi ? Math.max(m, v) : Math.min(m, v); }
    out[i] = m;
  }
  return out;
}
export const highest = (x: Arr, len: number) => extreme(x, len, true);
export const lowest = (x: Arr, len: number) => extreme(x, len, false);

export function sum(x: Arr, len: number): Arr {
  const out = sma(x, len);
  for (let i = 0; i < out.length; i++) out[i] *= len;
  return out;
}

export function change(x: Arr, len = 1): Arr {
  const out = nan(x.length);
  for (let i = len; i < x.length; i++) out[i] = x[i] - x[i - len];
  return out;
}

export function map(x: Arr, f: (v: number, i: number) => number): Arr {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = f(x[i], i);
  return out;
}

export function map2(a: Arr, b: Arr, f: (x: number, y: number, i: number) => number): Arr {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = f(a[i], b[i], i);
  return out;
}

export function trueRange(h: Arr, l: Arr, c: Arr): Arr {
  return map(h, (hi, i) => (i === 0 ? hi - l[i] : Math.max(hi - l[i], Math.abs(hi - c[i - 1]), Math.abs(l[i] - c[i - 1]))));
}

export function rsi(x: Arr, len: number): Arr {
  const up = map(x, (v, i) => (i === 0 ? NaN : Math.max(v - x[i - 1], 0)));
  const down = map(x, (v, i) => (i === 0 ? NaN : Math.max(x[i - 1] - v, 0)));
  const u = rma(up, len), d = rma(down, len);
  return map2(u, d, (a, b) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : b === 0 ? 100 : a === 0 ? 0 : 100 - 100 / (1 + a / b)));
}

export function stoch(src: Arr, h: Arr, l: Arr, len: number): Arr {
  const hh = highest(h, len), ll = lowest(l, len);
  return map(src, (v, i) => { const r = hh[i] - ll[i]; return r ? (100 * (v - ll[i])) / r : NaN; });
}
