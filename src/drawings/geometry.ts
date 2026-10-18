import type { Anchor, Drawing } from "./types";

export interface Pt { x: number; y: number }

export interface Timeline { times: ArrayLike<number>; barMs: number }

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

export const HIT_PX = 5;
export const HANDLE_PX = 7;

export interface Hit { id: string; handle: number | null }

export function hitTest(drawings: Drawing[], p: Pt, toPx: (a: Anchor) => Pt, w: number, h: number,
                        selectedId: string | null, measureText: (d: Drawing) => number): Hit | null {
  const sel = selectedId ? drawings.find((d) => d.id === selectedId) : undefined;
  if (sel && !sel.hidden) {
    const pts = handlePoints(sel, toPx, w);
    for (let i = pts.length - 1; i >= 0; i--) if (dist(p, pts[i]) <= HANDLE_PX) return { id: sel.id, handle: i };
  }
  for (let k = drawings.length - 1; k >= 0; k--) {
    const d = drawings[k];
    if (d.hidden) continue;
    if (hitsDrawing(d, p, toPx, w, h, measureText)) return { id: d.id, handle: null };
  }
  return null;
}

export function handlePoints(d: Drawing, toPx: (a: Anchor) => Pt, w: number): Pt[] {
  const pts = d.anchors.map(toPx);
  if (d.type === "hline") return [{ x: Math.max(12, Math.min(w - 12, pts[0].x)), y: pts[0].y }];
  if (d.type === "brush") return [];
  return pts;
}

function hitsDrawing(d: Drawing, p: Pt, toPx: (a: Anchor) => Pt, w: number, h: number, measureText: (d: Drawing) => number): boolean {
  const pts = d.anchors.map(toPx);
  const near = (a: Pt, b: Pt) => distToSegment(p, a, b) <= HIT_PX;
  switch (d.type) {
    case "trend": case "arrow": {
      const [a, b] = extendSegment(pts[0], pts[1], w, h, !!d.style.extendLeft, !!d.style.extendRight);
      return near(a, b);
    }
    case "ray": { const [a, b] = extendSegment(pts[0], pts[1], w, h, false, true); return near(a, b); }
    case "extended": { const [a, b] = extendSegment(pts[0], pts[1], w, h, true, true); return near(a, b); }
    case "hline": return Math.abs(p.y - pts[0].y) <= HIT_PX;
    case "hray": return Math.abs(p.y - pts[0].y) <= HIT_PX && p.x >= pts[0].x - HIT_PX;
    case "vline": return Math.abs(p.x - pts[0].x) <= HIT_PX;
    case "crossline": return Math.abs(p.x - pts[0].x) <= HIT_PX || Math.abs(p.y - pts[0].y) <= HIT_PX;
    case "rect": {
      const x0 = Math.min(pts[0].x, pts[1].x), x1 = Math.max(pts[0].x, pts[1].x), y0 = Math.min(pts[0].y, pts[1].y), y1 = Math.max(pts[0].y, pts[1].y);
      const inside = p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
      const onEdge = inside && (p.x - x0 <= HIT_PX || x1 - p.x <= HIT_PX || p.y - y0 <= HIT_PX || y1 - p.y <= HIT_PX);
      return onEdge || (inside && !!d.style.fillVisible);
    }
    case "channel": {
      if (pts.length < 3) return near(pts[0], pts[1] ?? pts[0]);
      const off = channelOffset(pts);
      const a2 = { x: pts[0].x, y: pts[0].y + off }, b2 = { x: pts[1].x, y: pts[1].y + off };
      return near(pts[0], pts[1]) || near(a2, b2) || (!!d.style.fillVisible && pointInPolygon(p, [pts[0], pts[1], b2, a2]));
    }
    case "fib": case "fibext": {
      const xs = d.type === "fib" ? [pts[0].x, pts[1].x] : [pts[2]?.x ?? pts[1].x, (pts[2]?.x ?? pts[1].x) + Math.abs(pts[1].x - pts[0].x)];
      const x0 = Math.min(...xs), x1 = d.style.extendRight ? w : Math.max(...xs);
      if (p.x < x0 - HIT_PX || p.x > x1 + HIT_PX) return d.type === "fibext" && near(pts[0], pts[1]);
      const ys = (d.style.levels ?? []).filter((l) => l.visible).map((l) => l.value);
      for (const lv of ys) {
        const price = d.type === "fib" ? fibPrice(d.anchors, lv, d.style.reverse) : fibExtPrice(d.anchors, lv);
        const y = toPx({ time: d.anchors[0].time, price }).y;
        if (Math.abs(p.y - y) <= HIT_PX) return true;
      }
      if (d.type === "fibext" && (near(pts[0], pts[1]) || (pts[2] && near(pts[1], pts[2])))) return true;
      if (ys.length && d.style.fillVisible) {
        const prices = ys.map((lv) => (d.type === "fib" ? fibPrice(d.anchors, lv, d.style.reverse) : fibExtPrice(d.anchors, lv)));
        const yA = toPx({ time: d.anchors[0].time, price: Math.max(...prices) }).y, yB = toPx({ time: d.anchors[0].time, price: Math.min(...prices) }).y;
        return p.y >= Math.min(yA, yB) && p.y <= Math.max(yA, yB);
      }
      return false;
    }
    case "brush":
      for (let i = 1; i < pts.length; i++) if (near(pts[i - 1], pts[i])) return true;
      return false;
    case "text": {
      const fs = d.style.fontSize ?? 14, wpx = measureText(d);
      const lines = (d.style.text ?? "").split("\n").length;
      return p.x >= pts[0].x - 2 && p.x <= pts[0].x + wpx + 2 && p.y >= pts[0].y - 2 && p.y <= pts[0].y + lines * fs * 1.25 + 2;
    }
  }
  return false;
}
