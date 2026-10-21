export interface ProfileBars { times: ArrayLike<number>; open: ArrayLike<number>; high: ArrayLike<number>; low: ArrayLike<number>; close: ArrayLike<number>; volume: ArrayLike<number> }

export interface Profile {
  lo: number; hi: number; step: number;
  up: Float64Array; down: Float64Array;
  poc: number; vaLo: number; vaHi: number; total: number;
}

export function computeProfile(b: ProfileBars, from: number, to: number, rows: number, valueArea = 70): Profile | null {
  const i0 = Math.max(0, Math.min(from, to)), i1 = Math.min(b.times.length - 1, Math.max(from, to));
  if (i1 < i0 || rows < 1) return null;
  let lo = Infinity, hi = -Infinity;
  for (let i = i0; i <= i1; i++) { if (b.low[i] < lo) lo = b.low[i]; if (b.high[i] > hi) hi = b.high[i]; }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (hi === lo) { hi = lo * 1.0005 || 1e-9; lo = lo * 0.9995; }
  const step = (hi - lo) / rows, up = new Float64Array(rows), down = new Float64Array(rows);
  for (let i = i0; i <= i1; i++) {
    const v = b.volume[i];
    if (!(v > 0)) continue;
    const l = b.low[i], h = b.high[i], dst = b.close[i] >= b.open[i] ? up : down;
    if (!(h > l)) { dst[Math.min(rows - 1, Math.max(0, Math.floor((l - lo) / step)))] += v; continue; }
    const r0 = Math.max(0, Math.floor((l - lo) / step)), r1 = Math.min(rows - 1, Math.floor((h - lo) / step));
    for (let r = r0; r <= r1; r++) {
      const a = Math.max(l, lo + r * step), z = Math.min(h, lo + (r + 1) * step);
      if (z > a) dst[r] += (v * (z - a)) / (h - l);
    }
  }
  let poc = 0, total = 0;
  for (let r = 0; r < rows; r++) { const t = up[r] + down[r]; total += t; if (t > up[poc] + down[poc]) poc = r; }
  let vaLo = poc, vaHi = poc, acc = up[poc] + down[poc];
  const need = (total * Math.max(0, Math.min(100, valueArea))) / 100;
  while (acc < need && (vaLo > 0 || vaHi < rows - 1)) {
    const below = vaLo > 0 ? up[vaLo - 1] + down[vaLo - 1] : -1, above = vaHi < rows - 1 ? up[vaHi + 1] + down[vaHi + 1] : -1;
    if (above >= below) { vaHi++; acc += above; } else { vaLo--; acc += below; }
  }
  return { lo, hi, step, up, down, poc, vaLo, vaHi, total };
}

export function sessionRanges(times: ArrayLike<number>, from: number, to: number, period: number, offset = 0): [number, number][] {
  const out: [number, number][] = [];
  let start = -1, key = NaN;
  for (let i = Math.max(0, from); i <= Math.min(times.length - 1, to); i++) {
    const k = Math.floor((times[i] - offset) / period);
    if (k !== key) { if (start >= 0) out.push([start, i - 1]); start = i; key = k; }
  }
  if (start >= 0) out.push([start, Math.min(times.length - 1, to)]);
  return out;
}

export interface ProfileColors { up: string; down: string; vaUp: string; vaDown: string; poc: string }

export function paintProfile(ctx: CanvasRenderingContext2D, p: Profile, yOf: (price: number) => number | null, edge: number, maxWidth: number,
                             grow: 1 | -1, c: ProfileColors, poc: { show: boolean; x0: number; x1: number }) {
  let max = 0;
  for (let r = 0; r < p.up.length; r++) max = Math.max(max, p.up[r] + p.down[r]);
  if (!(max > 0)) return;
  for (let r = 0; r < p.up.length; r++) {
    const ya = yOf(p.lo + r * p.step), yb = yOf(p.lo + (r + 1) * p.step);
    if (ya === null || yb === null) continue;
    const top = Math.min(ya, yb) + 0.5, h = Math.max(1, Math.abs(yb - ya) - 1);
    const inVa = r >= p.vaLo && r <= p.vaHi, wu = (p.up[r] / max) * maxWidth, wd = (p.down[r] / max) * maxWidth;
    ctx.fillStyle = inVa ? c.vaUp : c.up;
    ctx.fillRect(grow > 0 ? edge : edge - wu, top, wu, h);
    ctx.fillStyle = inVa ? c.vaDown : c.down;
    ctx.fillRect(grow > 0 ? edge + wu : edge - wu - wd, top, wd, h);
  }
  if (poc.show) {
    const y = yOf(p.lo + (p.poc + 0.5) * p.step);
    if (y !== null) { ctx.strokeStyle = c.poc; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(poc.x0, y); ctx.lineTo(poc.x1, y); ctx.stroke(); }
  }
}
