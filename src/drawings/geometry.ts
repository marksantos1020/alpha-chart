import type { Anchor } from "./types";

export interface Pt { x: number; y: number }

export interface Timeline { times: ArrayLike<number>; barMs: number }

export interface Bars { times: number[]; open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }

function lowerBound(a: ArrayLike<number>, x: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; }
  return lo;
}

export function timeToLogical(tl: Timeline, t: number): number {
  const n = tl.times.length;
  if (n === 0) return 0;
  if (t <= tl.times[0]) return (t - tl.times[0]) / tl.barMs;
  if (t >= tl.times[n - 1]) return n - 1 + (t - tl.times[n - 1]) / tl.barMs;
  const i = lowerBound(tl.times, t);
  if (tl.times[i] === t) return i;
  const a = tl.times[i - 1], b = tl.times[i];
  return i - 1 + (t - a) / (b - a);
}

export function logicalToTime(tl: Timeline, l: number): number {
  const n = tl.times.length;
  if (n === 0) return 0;
  if (l <= 0) return tl.times[0] + l * tl.barMs;
  if (l >= n - 1) return tl.times[n - 1] + (l - (n - 1)) * tl.barMs;
  const i = Math.floor(l), f = l - i;
  return tl.times[i] + f * (tl.times[i + 1] - tl.times[i]);
}

export function snapTime(tl: Timeline, l: number): number { return logicalToTime(tl, Math.round(l)); }

export interface LabelRect { x: number; y: number; w: number; h: number; side: "above" | "below" | "inside" }

export function placeMeasureLabel(a: Pt, b: Pt, size: { w: number; h: number }, pane: { w: number; h: number }, up: boolean,
                                  gap = 6, margin = 4): LabelRect {
  const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
  const x = Math.max(margin, Math.min((a.x + b.x) / 2 - size.w / 2, pane.w - size.w - margin));
  const above = top - gap - size.h, below = bottom + gap;
  const fitsAbove = above >= margin, fitsBelow = below + size.h <= pane.h - margin;
  for (const side of up ? (["above", "below"] as const) : (["below", "above"] as const)) {
    if (side === "above" && fitsAbove) return { x, y: above, w: size.w, h: size.h, side };
    if (side === "below" && fitsBelow) return { x, y: below, w: size.w, h: size.h, side };
  }
  const y = up ? margin : Math.max(margin, pane.h - size.h - margin);
  return { x, y, w: size.w, h: size.h, side: "inside" };
}

export function dist(a: Pt, b: Pt): number { return Math.hypot(a.x - b.x, a.y - b.y); }

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function extendSegment(a: Pt, b: Pt, w: number, h: number, left: boolean, right: boolean): [Pt, Pt] {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return [a, b];
  let tMin = -Infinity, tMax = Infinity;
  const clip = (p: number, d: number, lo: number, hi: number) => {
    if (d === 0) { if (p < lo || p > hi) { tMin = Infinity; tMax = -Infinity; } return; }
    const t1 = (lo - p) / d, t2 = (hi - p) / d;
    tMin = Math.max(tMin, Math.min(t1, t2)); tMax = Math.min(tMax, Math.max(t1, t2));
  };
  clip(a.x, dx, 0, w); clip(a.y, dy, 0, h);
  const forward = dx >= 0;
  const extStart = forward ? left : right, extEnd = forward ? right : left;
  const t0 = extStart && Number.isFinite(tMin) ? Math.min(0, tMin) : 0;
  const t1 = extEnd && Number.isFinite(tMax) ? Math.max(1, tMax) : 1;
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
}

export function snapAngle(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y, r = Math.hypot(dx, dy);
  if (r === 0) return b;
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  if (Math.abs(Math.sin(ang)) < 1e-9) return { x: b.x, y: a.y };
  if (Math.abs(Math.cos(ang)) < 1e-9) return { x: a.x, y: b.y };
  return { x: a.x + r * Math.cos(ang), y: a.y + r * Math.sin(ang) };
}

export function fibPrice(anchors: Anchor[], level: number, reverse = false): number {
  const [a, b] = reverse ? [anchors[1], anchors[0]] : [anchors[0], anchors[1]];
  return b.price - (b.price - a.price) * level;
}

export function fibExtPrice(anchors: Anchor[], level: number): number {
  const [a, b, c] = anchors;
  return c.price + (b.price - a.price) * level;
}

export function channelOffset(p: Pt[]): number {
  const [a, b, c] = p;
  if (b.x === a.x) return c.y - a.y;
  const yAtC = a.y + ((b.y - a.y) * (c.x - a.x)) / (b.x - a.x);
  return c.y - yAtC;
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function rayFrom(a: Pt, b: Pt, w: number, h: number): [Pt, Pt] {
  return extendSegment(a, b, w, h, b.x < a.x, b.x >= a.x);
}

export function pitchforkOrigin(type: string, p: Pt[]): Pt {
  const [a, b] = p;
  if (type === "schiff") return { x: a.x, y: (a.y + b.y) / 2 };
  if (type === "modschiff") return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return a;
}

export interface Regression { from: number; to: number; at: (l: number) => number; dev: number; n: number }

export function regression(tl: Timeline, bars: Bars, t0: number, t1: number, devs = 2): Regression | null {
  const la = timeToLogical(tl, Math.min(t0, t1)), lb = timeToLogical(tl, Math.max(t0, t1));
  const i0 = Math.max(0, Math.ceil(la - 1e-9)), i1 = Math.min(bars.close.length - 1, Math.floor(lb + 1e-9));
  const n = i1 - i0 + 1;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = i0; i <= i1; i++) { const y = bars.close[i]; sx += i; sy += y; sxx += i * i; sxy += i * y; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
  let ss = 0;
  for (let i = i0; i <= i1; i++) { const r = bars.close[i] - (icpt + slope * i); ss += r * r; }
  return { from: la, to: lb, at: (l) => icpt + slope * l, dev: devs * Math.sqrt(ss / n), n };
}

export function vwapFrom(tl: Timeline, bars: Bars, t: number): { time: number; price: number }[] {
  const start = Math.max(0, Math.ceil(timeToLogical(tl, t) - 1e-9));
  const out: { time: number; price: number }[] = [];
  let pv = 0, v = 0, k = 0, sum = 0;
  for (let i = start; i < bars.close.length; i++) {
    const tp = (bars.high[i] + bars.low[i] + bars.close[i]) / 3, vol = bars.volume[i] || 0;
    pv += tp * vol; v += vol; sum += tp; k++;
    out.push({ time: bars.times[i], price: v > 0 ? pv / v : sum / k });
  }
  return out;
}
