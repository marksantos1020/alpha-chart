import { fmtNum } from "../format";
import {
  channelOffset, dist, distToSegment, extendSegment, fibExtPrice, fibPrice, pitchforkOrigin, pointInPolygon, rayFrom, regression,
  timeToLogical, vwapFrom, type Bars, type Pt, type Timeline,
} from "./geometry";
import { EXTEND_TYPES, type Anchor, type Drawing } from "./types";
import { computeProfile, paintProfile } from "../volumeProfile";

type Ctx = CanvasRenderingContext2D;

export interface Env {
  toPx(a: Anchor): Pt;
  w: number;
  h: number;
  formatPrice(p: number): string;
  formatTime(ms: number): string;
  timeline: Timeline;
  bars: Bars;
  volumeUnit?: string;
}

export const FONT = '"IBM Plex Sans", system-ui, sans-serif';
export const UP = "#089981";
export const DOWN = "#F23645";
export const BLUE = "#2962FF";

let measureCtx: Ctx | null | undefined;
export function measure(font: string, text: string): number {
  if (measureCtx === undefined) measureCtx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * fontSize(font) * 0.6;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}
const fontSize = (font: string) => parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "12");

export function textWidth(d: Drawing): number {
  const font = `${d.style.fontSize ?? 14}px ${FONT}`;
  return Math.max(...(d.style.text ?? "").split("\n").map((l) => measure(font, l)), 8);
}

export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (m) { const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`; }
  const r = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (r) { const [x, y, z] = r[1].split(",").map((v) => v.trim()); return `rgba(${x},${y},${z},${alpha})`; }
  return color;
}

export function setLine(ctx: Ctx, color: string, width: number, style: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = style === "dotted" ? "round" : "butt";
  ctx.setLineDash(style === "dashed" ? [6 + width, 4 + width] : style === "dotted" ? [0.5, 3 + width] : []);
}
export function line(ctx: Ctx, a: Pt, b: Pt) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
function path(ctx: Ctx, pts: Pt[], close = false) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (close) ctx.closePath();
}
function fillPoly(ctx: Ctx, pts: Pt[], color: string) { if (pts.length < 3) return; path(ctx, pts, true); ctx.fillStyle = color; ctx.fill(); }
function head(ctx: Ctx, from: Pt, tip: Pt, size: number) {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(tip.x - size * Math.cos(ang - 0.45), tip.y - size * Math.sin(ang - 0.45));
  ctx.lineTo(tip.x, tip.y);
  ctx.lineTo(tip.x - size * Math.cos(ang + 0.45), tip.y - size * Math.sin(ang + 0.45));
  ctx.stroke();
}
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

export function panel(ctx: Ctx, lines: string[], x: number, y: number, bg: string, fg = "#ffffff",
                      align: "left" | "center" | "right" = "center", valign: "top" | "middle" | "bottom" = "middle", size = 12) {
  ctx.font = `${size}px ${FONT}`;
  const lh = Math.round(size * 1.35), pad = 6;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2, h = lines.length * lh + pad;
  const bx = align === "left" ? x : align === "right" ? x - w : x - w / 2;
  const by = valign === "top" ? y : valign === "bottom" ? y - h : y - h / 2;
  ctx.setLineDash([]);
  roundRect(ctx, bx, by, w, h, 3);
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, bx + w / 2, by + pad / 2 + 1 + i * lh));
  return { x: bx, y: by, w, h };
}

function tag(ctx: Ctx, text: string, p: Pt, color: string, above: boolean) {
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = above ? "bottom" : "top";
  ctx.fillText(text, p.x, p.y + (above ? -6 : 6));
}

const pct = (a: number, b: number) => (a ? ((b - a) / a) * 100 : 0);
const signed = (v: number, fmt: (n: number) => string) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;

function spanText(ms: number): string {
  const days = Math.floor(ms / 86_400_000), hours = Math.floor((ms % 86_400_000) / 3_600_000), mins = Math.round((ms % 3_600_000) / 60_000);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${mins}m` : `${mins}m`;
}

export function rangeStats(env: Env, a: Anchor, b: Anchor) {
  const la = timeToLogical(env.timeline, a.time), lb = timeToLogical(env.timeline, b.time);
  let vol = 0;
  const i0 = Math.max(0, Math.ceil(Math.min(la, lb))), i1 = Math.min(env.bars.volume.length - 1, Math.floor(Math.max(la, lb)));
  for (let i = i0; i <= i1; i++) vol += env.bars.volume[i] || 0;
  const dp = b.price - a.price;
  return {
    up: dp >= 0,
    price: `${signed(dp, env.formatPrice)} (${dp >= 0 ? "+" : ""}${pct(a.price, b.price).toFixed(2)}%)`,
    bars: `${Math.round(lb - la)} bars, ${spanText(Math.abs(b.time - a.time))}`,
    vol: `Vol ${fmtNum(vol, 2)}${env.volumeUnit ? ` ${env.volumeUnit}` : ""}`,
  };
}

const PATTERN_LABELS: Partial<Record<Drawing["type"], string[]>> = {
  xabcd: ["X", "A", "B", "C", "D"], abcd: ["A", "B", "C", "D"], trianglepat: ["A", "B", "C", "D"],
  headshoulders: ["", "Left Shoulder", "", "Head", "", "Right Shoulder", ""], threedrives: ["", "1", "", "2", "", "3", ""],
  elliott: ["", "(1)", "(2)", "(3)", "(4)", "(5)"], elliottabc: ["", "(A)", "(B)", "(C)"],
  elliotttri: ["", "(A)", "(B)", "(C)", "(D)", "(E)"], elliottwxy: ["", "(W)", "(X)", "(Y)"],
};

function labelPoints(ctx: Ctx, pts: Pt[], labels: string[], color: string) {
  pts.forEach((p, i) => {
    const t = labels[i];
    if (!t) return;
    const prev = pts[i - 1] ?? pts[i + 1], next = pts[i + 1] ?? pts[i - 1];
    const above = !prev || !next ? true : p.y <= (prev.y + next.y) / 2;
    tag(ctx, t, p, color, above);
  });
}

function ratio(ctx: Ctx, a: Pt, b: Pt, value: number, color: string) {
  setLine(ctx, color, 1, "dashed");
  line(ctx, a, b);
  if (!Number.isFinite(value)) return;
  panel(ctx, [value.toFixed(3)], (a.x + b.x) / 2, (a.y + b.y) / 2, color, "#ffffff", "center", "middle", 11);
}

export function longShortBox(d: Drawing, pts: Pt[]) {
  const [e, t, s] = pts;
  return { x0: Math.min(e.x, t.x), x1: Math.max(e.x, t.x), e, t, s };
}

export function paint(ctx: Ctx, d: Drawing, env: Env) {
  const pts = d.anchors.map(env.toPx);
  if (pts.length === 0) return;
  const s = d.style, { w, h } = env;
  const yOf = (price: number) => env.toPx({ time: d.anchors[0].time, price }).y;
  const fill = (poly: Pt[], color = s.fill) => { if (s.fillVisible && color) fillPoly(ctx, poly, color); };
  ctx.save();
  setLine(ctx, s.color, s.width, s.lineStyle);
  switch (d.type) {
    case "trend": case "arrow": case "ray": case "extended": case "info": case "angle": {
      if (pts.length < 2) break;
      const [p0, p1] = pts;
      let seg: [Pt, Pt];
      if (d.type === "ray") seg = rayFrom(p0, p1, w, h);
      else if (d.type === "extended") seg = extendSegment(p0, p1, w, h, true, true);
      else seg = extendSegment(p0, p1, w, h, EXTEND_TYPES.has(d.type) && !!s.extendLeft, EXTEND_TYPES.has(d.type) && !!s.extendRight);
      line(ctx, seg[0], seg[1]);
      if (d.type === "arrow") head(ctx, p0, p1, 8 + 2 * s.width);
      if (d.type === "info" && dist(p0, p1) > 2) {
        const st = rangeStats(env, d.anchors[0], d.anchors[1]);
        const deg = (Math.atan2(p0.y - p1.y, p1.x - p0.x) * 180) / Math.PI;
        panel(ctx, [st.price, st.bars, `${deg.toFixed(2)}°`], p1.x + 8, p1.y, withAlpha(s.color, 0.9), "#ffffff", "left", "middle");
      }
      if (d.type === "angle" && dist(p0, p1) > 2) {
        const r = Math.min(40, dist(p0, p1));
        setLine(ctx, s.color, 1, "dashed");
        line(ctx, p0, { x: p0.x + (p1.x >= p0.x ? 1 : -1) * Math.max(r + 20, 60), y: p0.y });
        const base = p1.x >= p0.x ? 0 : Math.PI;
        let ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        if (base && ang < 0) ang += Math.PI * 2;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(p0.x, p0.y, r, Math.min(base, ang), Math.max(base, ang)); ctx.stroke();
        const deg = (Math.atan2(p0.y - p1.y, Math.abs(p1.x - p0.x)) * 180) / Math.PI;
        ctx.font = `12px ${FONT}`; ctx.fillStyle = s.color; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(`${deg.toFixed(2)}°`, p0.x + (p1.x >= p0.x ? r + 6 : -r - 46), p0.y + (p1.y < p0.y ? -9 : 9));
      }
      break;
    }
    case "hline": line(ctx, { x: 0, y: pts[0].y }, { x: w, y: pts[0].y }); break;
    case "hray": line(ctx, pts[0], { x: w, y: pts[0].y }); break;
    case "vline": line(ctx, { x: pts[0].x, y: 0 }, { x: pts[0].x, y: h }); break;
    case "crossline":
      line(ctx, { x: 0, y: pts[0].y }, { x: w, y: pts[0].y });
      line(ctx, { x: pts[0].x, y: 0 }, { x: pts[0].x, y: h });
      break;
    case "channel": {
      if (pts.length < 2) break;
      const off = pts.length < 3 ? 0 : channelOffset(pts);
      const a2 = { x: pts[0].x, y: pts[0].y + off }, b2 = { x: pts[1].x, y: pts[1].y + off };
      fill([pts[0], pts[1], b2, a2]);
      line(ctx, pts[0], pts[1]);
      if (pts.length < 3) break;
      line(ctx, a2, b2);
      setLine(ctx, s.color, 1, "dashed");
      line(ctx, { x: pts[0].x, y: pts[0].y + off / 2 }, { x: pts[1].x, y: pts[1].y + off / 2 });
      break;
    }
    case "regression": {
      if (pts.length < 2) break;
      const r = regression(env.timeline, env.bars, d.anchors[0].time, d.anchors[1].time);
      if (!r) { line(ctx, pts[0], pts[1]); break; }
      const at = (l: number, k: number) => env.toPx({ time: timeAt(env.timeline, l), price: r.at(l) + k * r.dev });
      const up = [at(r.from, 1), at(r.to, 1)], mid = [at(r.from, 0), at(r.to, 0)], dn = [at(r.from, -1), at(r.to, -1)];
      fill([up[0], up[1], dn[1], dn[0]]);
      line(ctx, up[0], up[1]); line(ctx, dn[0], dn[1]);
      setLine(ctx, s.color, s.width, "dashed");
      line(ctx, mid[0], mid[1]);
      break;
    }
    case "flattop": {
      if (pts.length < 2) break;
      const y = pts.length > 2 ? pts[2].y : pts[0].y;
      const flat = [{ x: pts[0].x, y }, { x: pts[1].x, y }];
      fill([pts[0], pts[1], flat[1], flat[0]]);
      line(ctx, pts[0], pts[1]);
      if (pts.length > 2) line(ctx, flat[0], flat[1]);
      break;
    }
    case "pitchfork": case "schiff": case "modschiff": {
      if (pts.length < 2) break;
      if (pts.length < 3 || dist(pts[1], pts[2]) < 1) { line(ctx, pts[0], pts[1]); break; }
      const o = pitchforkOrigin(d.type, pts), m = { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 };
      const dir = { x: m.x - o.x, y: m.y - o.y };
      const fork = (p: Pt) => rayFrom(p, { x: p.x + dir.x, y: p.y + dir.y }, w, h)[1];
      const e1 = fork(pts[1]), e2 = fork(pts[2]);
      fill([pts[1], e1, e2, pts[2]]);
      line(ctx, o, fork(o));
      line(ctx, pts[1], e1); line(ctx, pts[2], e2);
      line(ctx, pts[1], pts[2]);
      if (o !== pts[0]) { setLine(ctx, s.color, 1, "dashed"); line(ctx, pts[0], pts[1]); }
      break;
    }
    case "fib": case "fibext": paintFib(ctx, d, pts, env, yOf); break;
    case "fibchannel": {
      if (pts.length < 2) break;
      const off = pts.length < 3 ? 0 : channelOffset(pts);
      const lv = visibleLevels(d);
      const seg = (v: number): [Pt, Pt] => {
        const a = { x: pts[0].x, y: pts[0].y + off * v }, b = { x: pts[1].x, y: pts[1].y + off * v };
        return s.extendRight ? extendSegment(a, b, w, h, false, true) : [a, b];
      };
      if (s.fillVisible) for (let i = 0; i + 1 < lv.length; i++) { const a = seg(lv[i].value), b = seg(lv[i + 1].value); fillPoly(ctx, [a[0], a[1], b[1], b[0]], withAlpha(lv[i + 1].color, 0.12)); }
      for (const l of lv) {
        const [a, b] = seg(l.value);
        setLine(ctx, l.color, s.width, s.lineStyle); line(ctx, a, b);
        if (s.showLabels !== false) { ctx.font = `11px ${FONT}`; ctx.fillStyle = l.color; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(String(l.value), a.x - 4, a.y); }
      }
      break;
    }
    case "fibtime": {
      if (pts.length < 2) break;
      const unit = pts[1].x - pts[0].x;
      for (const l of visibleLevels(d)) {
        const x = pts[0].x + unit * l.value;
        if (x < -1 || x > w + 1) continue;
        setLine(ctx, l.color, s.width, s.lineStyle); line(ctx, { x, y: 0 }, { x, y: h });
        if (s.showLabels !== false) { ctx.font = `11px ${FONT}`; ctx.fillStyle = l.color; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillText(String(l.value), x + 3, h - 4); }
      }
      setLine(ctx, "#787B86", 1, "dashed"); line(ctx, pts[0], pts[1]);
      break;
    }
    case "fibfan": {
      if (pts.length < 2) break;
      const [o, p] = pts, lv = visibleLevels(d);
      const py = (v: number) => ({ x: p.x, y: o.y + (p.y - o.y) * v }), tx = (v: number) => ({ x: o.x + (p.x - o.x) * v, y: p.y });
      if (s.fillVisible) for (let i = 0; i + 1 < lv.length; i++) fillPoly(ctx, [o, py(lv[i].value), py(lv[i + 1].value)], withAlpha(lv[i + 1].color, 0.1));
      for (const l of lv) {
        setLine(ctx, l.color, s.width, s.lineStyle);
        const a = py(l.value), b = tx(l.value);
        line(ctx, o, rayFrom(o, a, w, h)[1]);
        if (Math.abs(p.x - o.x) > 1) line(ctx, o, rayFrom(o, b, w, h)[1]);
        if (s.showLabels !== false) { ctx.font = `11px ${FONT}`; ctx.fillStyle = l.color; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(String(l.value), a.x + 4, a.y); }
      }
      setLine(ctx, "#787B86", 1, "dashed");
      ctx.strokeRect(Math.min(o.x, p.x), Math.min(o.y, p.y), Math.abs(p.x - o.x), Math.abs(p.y - o.y));
      break;
    }
    case "fibcircles": case "fibarcs": {
      if (pts.length < 2) break;
      const c = d.type === "fibcircles" ? pts[0] : pts[1], other = d.type === "fibcircles" ? pts[1] : pts[0], R = dist(pts[0], pts[1]);
      const above = other.y < c.y;
      for (const l of visibleLevels(d)) {
        const r = R * l.value;
        if (r < 0.5) continue;
        setLine(ctx, l.color, s.width, s.lineStyle);
        ctx.beginPath();
        if (d.type === "fibcircles") ctx.arc(c.x, c.y, r, 0, Math.PI * 2); else ctx.arc(c.x, c.y, r, above ? Math.PI : 0, above ? Math.PI * 2 : Math.PI);
        ctx.stroke();
        if (s.showLabels !== false) { ctx.font = `11px ${FONT}`; ctx.fillStyle = l.color; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillText(String(l.value), c.x + r + 3, c.y - 2); }
      }
      setLine(ctx, "#787B86", 1, "dashed"); line(ctx, pts[0], pts[1]);
      break;
    }
    case "gannbox": {
      if (pts.length < 2) break;
      const [a, b] = pts, lv = visibleLevels(d);
      const X = (v: number) => a.x + (b.x - a.x) * v, Y = (v: number) => a.y + (b.y - a.y) * v;
      if (s.fillVisible) for (let i = 0; i + 1 < lv.length; i++) {
        fillPoly(ctx, [{ x: a.x, y: Y(lv[i].value) }, { x: b.x, y: Y(lv[i].value) }, { x: b.x, y: Y(lv[i + 1].value) }, { x: a.x, y: Y(lv[i + 1].value) }], withAlpha(lv[i + 1].color, 0.1));
      }
      ctx.font = `11px ${FONT}`;
      for (const l of lv) {
        setLine(ctx, l.color, s.width, s.lineStyle);
        line(ctx, { x: a.x, y: Y(l.value) }, { x: b.x, y: Y(l.value) });
        line(ctx, { x: X(l.value), y: a.y }, { x: X(l.value), y: b.y });
        if (s.showLabels !== false) {
          ctx.fillStyle = l.color;
          ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(String(l.value), Math.min(a.x, b.x) - 4, Y(l.value));
          ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(String(l.value), X(l.value), Math.min(a.y, b.y) - 3);
        }
      }
      break;
    }
    case "gannfan": {
      if (pts.length < 2) break;
      const [o, p] = pts, dx = p.x - o.x, dy = p.y - o.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) break;
      const fans: [number, number][] = [[1, 8], [1, 4], [1, 3], [1, 2], [1, 1], [2, 1], [3, 1], [4, 1], [8, 1]];
      const colors = ["#9C27B0", "#2962FF", "#00BCD4", "#089981", "#787B86", "#4CAF50", "#FF9800", "#F23645", "#E91E63"];
      fans.forEach(([pr, t], i) => {
        const k = Math.max(pr, t), q = { x: o.x + (dx * t) / k, y: o.y + (dy * pr) / k };
        setLine(ctx, colors[i], s.width, s.lineStyle);
        line(ctx, o, rayFrom(o, q, w, h)[1]);
        if (s.showLabels !== false) { ctx.font = `11px ${FONT}`; ctx.fillStyle = colors[i]; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillText(`${pr}/${t}`, q.x + 3, q.y - 2); }
      });
      break;
    }
    case "xabcd": case "abcd": case "trianglepat": case "headshoulders": case "threedrives":
    case "elliott": case "elliottabc": case "elliotttri": case "elliottwxy": {
      if (pts.length < 2) break;
      const P = d.anchors.map((a) => a.price), c = s.color;
      if (d.type === "xabcd") {
        fill(pts.slice(0, 3)); if (pts.length >= 5) fill(pts.slice(2, 5));
      } else if (d.type === "trianglepat") {
        fill(pts.slice(0, 3)); if (pts.length >= 4) fill(pts.slice(1, 4));
      } else if (d.type === "headshoulders" && pts.length >= 5) {
        fill(pts.slice(0, 3)); fill(pts.slice(2, 5)); if (pts.length >= 7) fill(pts.slice(4, 7));
      }
      setLine(ctx, c, s.width, s.lineStyle);
      path(ctx, pts); ctx.stroke();
      if (d.type === "xabcd") {
        if (pts.length >= 3) ratio(ctx, pts[0], pts[2], Math.abs(P[2] - P[1]) / Math.abs(P[1] - P[0]), c);
        if (pts.length >= 4) ratio(ctx, pts[1], pts[3], Math.abs(P[3] - P[2]) / Math.abs(P[2] - P[1]), c);
        if (pts.length >= 5) { ratio(ctx, pts[2], pts[4], Math.abs(P[4] - P[3]) / Math.abs(P[3] - P[2]), c); ratio(ctx, pts[0], pts[4], Math.abs(P[4] - P[1]) / Math.abs(P[1] - P[0]), c); }
      } else if (d.type === "abcd") {
        if (pts.length >= 3) ratio(ctx, pts[0], pts[2], Math.abs(P[2] - P[1]) / Math.abs(P[1] - P[0]), c);
        if (pts.length >= 4) ratio(ctx, pts[1], pts[3], Math.abs(P[3] - P[2]) / Math.abs(P[2] - P[1]), c);
      } else if (d.type === "trianglepat" && pts.length >= 4) {
        setLine(ctx, c, s.width, "dashed"); line(ctx, pts[0], pts[2]); line(ctx, pts[1], pts[3]);
      } else if (d.type === "headshoulders" && pts.length >= 5) {
        const [a, b] = [pts[2], pts[4]];
        const at = (x: number) => (b.x === a.x ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));
        const x0 = pts[0].x, x1 = pts[pts.length - 1].x;
        setLine(ctx, c, s.width, "solid"); line(ctx, { x: x0, y: at(x0) }, { x: x1, y: at(x1) });
      }
      labelPoints(ctx, pts, PATTERN_LABELS[d.type] ?? [], c);
      break;
    }
    case "cyclic": {
      if (pts.length < 2) break;
      const step = Math.abs(pts[1].x - pts[0].x);
      if (step < 2) { line(ctx, { x: pts[0].x, y: 0 }, { x: pts[0].x, y: h }); break; }
      const k0 = Math.ceil(-pts[0].x / step), k1 = Math.min(Math.floor((w - pts[0].x) / step), k0 + 1000);
      for (let k = Math.max(k0, 0); k <= k1; k++) { const x = pts[0].x + k * step; line(ctx, { x, y: 0 }, { x, y: h }); }
      break;
    }
    case "timecycles": {
      if (pts.length < 2) break;
      const step = Math.abs(pts[1].x - pts[0].x), ry = Math.abs(pts[1].y - pts[0].y) || step / 2, up = pts[1].y <= pts[0].y;
      if (step < 2) break;
      const k1 = Math.min(Math.floor((w - pts[0].x) / step), 1000);
      for (let k = Math.max(0, Math.ceil(-pts[0].x / step) - 1); k <= k1; k++) {
        const cx = pts[0].x + k * step + step / 2;
        ctx.beginPath(); ctx.ellipse(cx, pts[0].y, step / 2, ry, 0, up ? Math.PI : 0, up ? Math.PI * 2 : Math.PI); ctx.stroke();
      }
      break;
    }
    case "sine": {
      if (pts.length < 2) break;
      const half = pts[1].x - pts[0].x, A = (pts[1].y - pts[0].y) / 2, mid = (pts[0].y + pts[1].y) / 2;
      if (Math.abs(half) < 2) break;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) { const y = mid - A * Math.cos((Math.PI * (x - pts[0].x)) / half); if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      break;
    }
    case "long": case "short": {
      if (pts.length < 3) break;
      const { x0, x1, e, t, s: st } = longShortBox(d, pts);
      const [E, T, S] = d.anchors.map((a) => a.price);
      fillPoly(ctx, [{ x: x0, y: e.y }, { x: x1, y: e.y }, { x: x1, y: t.y }, { x: x0, y: t.y }], withAlpha(UP, 0.22));
      fillPoly(ctx, [{ x: x0, y: e.y }, { x: x1, y: e.y }, { x: x1, y: st.y }, { x: x0, y: st.y }], withAlpha(DOWN, 0.22));
      setLine(ctx, s.color, 1, "solid");
      line(ctx, { x: x0, y: e.y }, { x: x1, y: e.y });
      const mx = (x0 + x1) / 2, rr = Math.abs(E - S) > 0 ? Math.abs(T - E) / Math.abs(E - S) : 0;
      const tUp = t.y < e.y, sUp = st.y < e.y;
      panel(ctx, [`Target: ${env.formatPrice(T)} (${pct(E, T).toFixed(2)}%)`], mx, t.y + (tUp ? -4 : 4), UP, "#ffffff", "center", tUp ? "bottom" : "top");
      panel(ctx, [`Stop: ${env.formatPrice(S)} (${pct(E, S).toFixed(2)}%)`], mx, st.y + (sUp ? -4 : 4), DOWN, "#ffffff", "center", sUp ? "bottom" : "top");
      panel(ctx, [`${d.type === "long" ? "Long" : "Short"} ${env.formatPrice(E)}`, `Risk/reward ratio: ${rr.toFixed(2)}`], mx, e.y, withAlpha("#787B86", 0.95));
      break;
    }
    case "avwap": {
      const pv = vwapFrom(env.timeline, env.bars, d.anchors[0].time).map(env.toPx);
      if (pv.length < 2) { if (pv.length) { ctx.beginPath(); ctx.arc(pv[0].x, pv[0].y, 2, 0, Math.PI * 2); ctx.stroke(); } break; }
      ctx.lineJoin = "round";
      path(ctx, pv); ctx.stroke();
      break;
    }
    case "fixedvp": case "anchoredvp": {
      const n = env.bars.times.length;
      if (!n) break;
      const ta = d.anchors[0].time, tb = d.type === "fixedvp" ? d.anchors[1]?.time ?? ta : env.bars.times[n - 1];
      const i0 = Math.max(0, Math.ceil(timeToLogical(env.timeline, Math.min(ta, tb)) - 1e-9)), i1 = Math.min(n - 1, Math.floor(timeToLogical(env.timeline, Math.max(ta, tb)) + 1e-9));
      const p = computeProfile(env.bars, i0, i1, 24, 70);
      const xa = env.toPx({ time: Math.min(ta, tb), price: 0 }).x, xb = env.toPx({ time: Math.max(ta, tb), price: 0 }).x;
      if (!p) { line(ctx, { x: xa, y: 0 }, { x: xa, y: h }); break; }
      const yOf = (price: number) => env.toPx({ time: ta, price }).y;
      const top = yOf(p.hi), bottom = yOf(p.lo);
      fillPoly(ctx, [{ x: xa, y: top }, { x: xb, y: top }, { x: xb, y: bottom }, { x: xa, y: bottom }], withAlpha(s.color, 0.06));
      setLine(ctx, s.color, 1, "dashed");
      ctx.strokeRect(xa, top, xb - xa, bottom - top);
      paintProfile(ctx, p, yOf, xa, Math.max(20, (xb - xa) * 0.3), 1,
                   { up: "rgba(41,98,255,0.3)", down: "rgba(251,192,45,0.3)", vaUp: "rgba(41,98,255,0.65)", vaDown: "rgba(251,192,45,0.65)", poc: "#FF5252" },
                   { show: true, x0: xa, x1: xb });
      break;
    }
    case "pricerange": case "daterange": case "datepricerange": {
      if (pts.length < 2) break;
      const [a, b] = pts, st = rangeStats(env, d.anchors[0], d.anchors[1]);
      const color = d.type === "daterange" ? BLUE : st.up ? BLUE : DOWN;
      const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
      fillPoly(ctx, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], withAlpha(color, 0.18));
      setLine(ctx, color, 1, "solid");
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (d.type !== "daterange") { line(ctx, { x: mx, y: a.y }, { x: mx, y: b.y }); if (Math.abs(b.y - a.y) > 12) head(ctx, { x: mx, y: a.y }, { x: mx, y: b.y }, 6); }
      if (d.type !== "pricerange") { line(ctx, { x: a.x, y: my }, { x: b.x, y: my }); if (Math.abs(b.x - a.x) > 12) head(ctx, { x: a.x, y: my }, { x: b.x, y: my }, 6); }
      const lines = d.type === "pricerange" ? [st.price] : d.type === "daterange" ? [st.bars, st.vol] : [st.price, st.bars, st.vol];
      const below = d.type === "daterange" ? true : !st.up;
      panel(ctx, lines, mx, below ? y1 + 6 : y0 - 6, color, "#ffffff", "center", below ? "top" : "bottom");
      break;
    }
    case "brush": case "highlighter":
      if (pts.length < 2) break;
      ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash([]);
      if (d.type === "highlighter") ctx.strokeStyle = withAlpha(s.color, 0.4);
      path(ctx, pts); ctx.stroke();
      break;
    case "arrowmarker": {
      if (pts.length < 2 || dist(pts[0], pts[1]) < 2) break;
      const [a, b] = pts, len = dist(a, b), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      const hl = Math.min(len * 0.45, 26), hw = 11, sw = 4.5;
      const P = (along: number, side: number) => ({ x: a.x + ux * along - uy * side, y: a.y + uy * along + ux * side });
      const poly = [P(0, sw), P(len - hl, sw), P(len - hl, hw), P(len, 0), P(len - hl, -hw), P(len - hl, -sw), P(0, -sw)];
      fillPoly(ctx, poly, s.fillVisible && s.fill ? s.fill : s.color);
      ctx.setLineDash([]); ctx.lineWidth = 1; path(ctx, poly, true); ctx.stroke();
      break;
    }
    case "arrowup": case "arrowdown": {
      const p = pts[0], dir = d.type === "arrowup" ? 1 : -1;
      const poly = [p, { x: p.x + 9, y: p.y + dir * 10 }, { x: p.x + 4, y: p.y + dir * 10 }, { x: p.x + 4, y: p.y + dir * 22 },
                    { x: p.x - 4, y: p.y + dir * 22 }, { x: p.x - 4, y: p.y + dir * 10 }, { x: p.x - 9, y: p.y + dir * 10 }];
      fillPoly(ctx, poly, s.color);
      if (s.text) {
        const fs = s.fontSize ?? 14;
        ctx.font = `${fs}px ${FONT}`; ctx.fillStyle = s.textColor ?? s.color; ctx.textAlign = "center"; ctx.textBaseline = dir > 0 ? "top" : "bottom";
        s.text.split("\n").forEach((l, i, all) => ctx.fillText(l, p.x, dir > 0 ? p.y + 26 + i * fs * 1.25 : p.y - 26 - (all.length - 1 - i) * fs * 1.25));
      }
      break;
    }
    case "rect": {
      if (pts.length < 2) break;
      const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y), rw = Math.abs(pts[1].x - pts[0].x), rh = Math.abs(pts[1].y - pts[0].y);
      fill([{ x, y }, { x: x + rw, y }, { x: x + rw, y: y + rh }, { x, y: y + rh }]);
      ctx.strokeRect(x, y, rw, rh);
      break;
    }
    case "circle": case "ellipse": {
      if (pts.length < 2) break;
      const [a, b] = pts;
      ctx.beginPath();
      if (d.type === "circle") ctx.arc(a.x, a.y, dist(a, b), 0, Math.PI * 2);
      else ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      if (s.fillVisible && s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
      ctx.stroke();
      break;
    }
    case "triangle":
      if (pts.length < 2) break;
      fill(pts.slice(0, 3));
      path(ctx, pts.slice(0, 3), pts.length >= 3); ctx.stroke();
      break;
    case "polyline": case "path":
      if (pts.length < 2) break;
      ctx.lineJoin = "round";
      path(ctx, pts); ctx.stroke();
      if (d.type === "path") head(ctx, pts[pts.length - 2], pts[pts.length - 1], 8 + 2 * s.width);
      break;
    case "curve": {
      if (pts.length < 2) break;
      const [a, m, b] = pts.length >= 3 ? pts : [pts[0], pts[1], pts[1]];
      const c = { x: 2 * m.x - (a.x + b.x) / 2, y: 2 * m.y - (a.y + b.y) / 2 };
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.x, c.y, b.x, b.y); ctx.stroke();
      break;
    }
    case "text": {
      const fs = s.fontSize ?? 14;
      ctx.font = `${fs}px ${FONT}`;
      ctx.fillStyle = s.textColor ?? s.color;
      ctx.textBaseline = "top";
      (s.text ?? "").split("\n").forEach((l, i) => ctx.fillText(l, pts[0].x, pts[0].y + i * fs * 1.25));
      break;
    }
    case "callout": case "comment": {
      const fs = s.fontSize ?? 14, lines = (s.text ?? "").split("\n");
      const tw = textWidth(d) + 16, th = lines.length * fs * 1.25 + 10;
      const tip = pts[0];
      const box = d.type === "callout" && pts.length > 1 ? { x: pts[1].x, y: pts[1].y - th / 2 } : { x: tip.x - 6, y: tip.y - 12 - th };
      ctx.setLineDash([]);
      if (d.type === "callout") {
        const c = { x: box.x + tw / 2, y: box.y + th / 2 }, L = Math.hypot(tip.x - c.x, tip.y - c.y) || 1;
        const nx = (-(tip.y - c.y) / L) * 7, ny = ((tip.x - c.x) / L) * 7;
        fillPoly(ctx, [tip, { x: c.x + nx, y: c.y + ny }, { x: c.x - nx, y: c.y - ny }], s.color);
      } else {
        fillPoly(ctx, [tip, { x: tip.x + 4, y: box.y + th - 1 }, { x: tip.x + 14, y: box.y + th - 1 }], s.color);
      }
      roundRect(ctx, box.x, box.y, tw, th, 6); ctx.fillStyle = s.color; ctx.fill();
      ctx.font = `${fs}px ${FONT}`; ctx.fillStyle = s.textColor ?? "#ffffff"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      lines.forEach((l, i) => ctx.fillText(l, box.x + 8, box.y + 5 + i * fs * 1.25));
      break;
    }
    case "pricelabel": {
      const p = pts[0];
      const r = panel(ctx, [env.formatPrice(d.anchors[0].price)], p.x + 4, p.y - 10, s.color, "#ffffff", "left", "bottom");
      fillPoly(ctx, [p, { x: r.x + 4, y: r.y + r.h - 1 }, { x: r.x + 14, y: r.y + r.h - 1 }], s.color);
      break;
    }
    case "pricenote": {
      const p = pts[0], q = pts[1] ?? pts[0];
      line(ctx, p, q);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill();
      panel(ctx, [env.formatPrice(d.anchors[0].price)], q.x + (q.x >= p.x ? 4 : -4), q.y, s.color, "#ffffff", q.x >= p.x ? "left" : "right", "middle");
      break;
    }
    case "flag": {
      const p = pts[0];
      ctx.setLineDash([]); ctx.lineWidth = 1.5;
      line(ctx, p, { x: p.x, y: p.y - 26 });
      fillPoly(ctx, [{ x: p.x, y: p.y - 26 }, { x: p.x + 16, y: p.y - 26 }, { x: p.x + 12, y: p.y - 20.5 }, { x: p.x + 16, y: p.y - 15 }, { x: p.x, y: p.y - 15 }], s.color);
      break;
    }
    case "icon": {
      const fs = s.fontSize ?? 28;
      ctx.font = `${fs}px ${FONT}`; ctx.fillStyle = s.color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(s.text ?? "", pts[0].x, pts[0].y);
      break;
    }
  }
  ctx.restore();
}

function timeAt(tl: Timeline, l: number): number {
  const n = tl.times.length;
  if (n === 0) return 0;
  if (l <= 0) return tl.times[0] + l * tl.barMs;
  if (l >= n - 1) return tl.times[n - 1] + (l - (n - 1)) * tl.barMs;
  const i = Math.floor(l);
  return tl.times[i] + (l - i) * (tl.times[i + 1] - tl.times[i]);
}

function visibleLevels(d: Drawing) { return (d.style.levels ?? []).filter((l) => l.visible).slice().sort((a, b) => a.value - b.value); }

function paintFib(ctx: Ctx, d: Drawing, pts: Pt[], env: Env, yOf: (price: number) => number) {
  const s = d.style;
  if (pts.length < 2) return;
  if (d.type === "fibext" && pts.length < 3) { setLine(ctx, s.color, 1, "dashed"); line(ctx, pts[0], pts[1]); return; }
  const x0 = d.type === "fib" ? Math.min(pts[0].x, pts[1].x) : pts[2].x;
  const x1 = s.extendRight ? env.w : d.type === "fib" ? Math.max(pts[0].x, pts[1].x) : pts[2].x + Math.abs(pts[1].x - pts[0].x);
  const levels = visibleLevels(d);
  const priceOf = (lv: number) => (d.type === "fib" ? fibPrice(d.anchors, lv, s.reverse) : fibExtPrice(d.anchors, lv));
  if (s.fillVisible) {
    for (let i = 0; i + 1 < levels.length; i++) {
      const ya = yOf(priceOf(levels[i].value)), yb = yOf(priceOf(levels[i + 1].value));
      fillPoly(ctx, [{ x: x0, y: ya }, { x: x1, y: ya }, { x: x1, y: yb }, { x: x0, y: yb }], withAlpha(levels[i + 1].color, 0.12));
    }
  }
  ctx.font = `11px ${FONT}`;
  ctx.textBaseline = "bottom";
  for (const lv of levels) {
    const yy = yOf(priceOf(lv.value));
    setLine(ctx, lv.color, s.width, s.lineStyle);
    line(ctx, { x: x0, y: yy }, { x: x1, y: yy });
    if (s.showLabels !== false) {
      ctx.fillStyle = lv.color; ctx.textAlign = "right";
      ctx.fillText(`${lv.value} (${env.formatPrice(priceOf(lv.value))})`, x0 - 4, yy + 5);
    }
  }
  setLine(ctx, "#787B86", 1, "dashed");
  line(ctx, pts[0], pts[1]);
  if (d.type === "fibext") line(ctx, pts[1], pts[2]);
}

class Recorder {
  segs: [Pt, Pt][] = [];
  areas: Pt[][] = [];
  boxes: { x: number; y: number; w: number; h: number }[] = [];
  font = `12px ${FONT}`;
  textAlign: CanvasTextAlign = "left";
  textBaseline: CanvasTextBaseline = "alphabetic";
  lineWidth = 1;
  strokeStyle: unknown = "";
  fillStyle: unknown = "";
  lineCap = "butt";
  lineJoin = "miter";
  private subs: Pt[][] = [];
  private cur: Pt[] | null = null;
  save() {} restore() {} setLineDash() {}
  beginPath() { this.subs = []; this.cur = null; }
  moveTo(x: number, y: number) { this.cur = [{ x, y }]; this.subs.push(this.cur); }
  lineTo(x: number, y: number) { if (!this.cur) this.moveTo(x, y); else this.cur.push({ x, y }); }
  closePath() { if (this.cur?.length) this.cur.push({ ...this.cur[0] }); }
  rect(x: number, y: number, w: number, h: number) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  roundRect(x: number, y: number, w: number, h: number) { this.rect(x, y, w, h); }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false) { this.ellipse(cx, cy, r, r, 0, a0, a1, ccw); }
  ellipse(cx: number, cy: number, rx: number, ry: number, _rot: number, a0: number, a1: number, ccw = false) {
    let sweep = a1 - a0;
    if (Math.abs(sweep) >= Math.PI * 2) sweep = ccw ? -Math.PI * 2 : Math.PI * 2;
    else if (!ccw && sweep < 0) sweep += Math.PI * 2;
    else if (ccw && sweep > 0) sweep -= Math.PI * 2;
    const n = Math.max(8, Math.ceil((Math.abs(sweep) * Math.max(rx, ry)) / 6));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n, x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
      if (i === 0 && !this.cur) this.moveTo(x, y); else this.lineTo(x, y);
    }
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    const s = this.cur?.[this.cur.length - 1] ?? { x, y };
    for (let i = 1; i <= 24; i++) {
      const t = i / 24, u = 1 - t;
      this.lineTo(u * u * s.x + 2 * u * t * cx + t * t * x, u * u * s.y + 2 * u * t * cy + t * t * y);
    }
  }
  stroke() { for (const sub of this.subs) for (let i = 1; i < sub.length; i++) this.segs.push([sub[i - 1], sub[i]]); }
  fill() { for (const sub of this.subs) if (sub.length >= 3) this.areas.push(sub); }
  strokeRect(x: number, y: number, w: number, h: number) { this.beginPath(); this.rect(x, y, w, h); this.stroke(); }
  fillRect(x: number, y: number, w: number, h: number) { this.beginPath(); this.rect(x, y, w, h); this.fill(); }
  measureText(t: string) { return { width: measure(this.font, t) } as TextMetrics; }
  fillText(t: string, x: number, y: number) {
    const w = measure(this.font, t), h = fontSize(this.font);
    const bx = this.textAlign === "center" ? x - w / 2 : this.textAlign === "right" || this.textAlign === "end" ? x - w : x;
    const by = this.textBaseline === "top" ? y : this.textBaseline === "middle" ? y - h / 2 : this.textBaseline === "bottom" ? y - h : y - h * 0.8;
    this.boxes.push({ x: bx, y: by, w, h });
  }
}

export const HIT_PX = 5;
export const HANDLE_PX = 7;

export interface Hit { id: string; handle: number | null }

export function hitsDrawing(d: Drawing, p: Pt, env: Env): boolean {
  const r = new Recorder();
  paint(r as unknown as Ctx, d, env);
  const tol = Math.max(HIT_PX, (d.type === "highlighter" ? d.style.width : 0) / 2 + 2);
  for (const [a, b] of r.segs) if (distToSegment(p, a, b) <= tol) return true;
  for (const b of r.boxes) if (p.x >= b.x - 2 && p.x <= b.x + b.w + 2 && p.y >= b.y - 2 && p.y <= b.y + b.h + 2) return true;
  for (const poly of r.areas) if (pointInPolygon(p, poly)) return true;
  return false;
}

export function hitTest(drawings: Drawing[], p: Pt, env: Env, selectedId: string | null): Hit | null {
  const sel = selectedId ? drawings.find((d) => d.id === selectedId) : undefined;
  if (sel && !sel.hidden) {
    const pts = handlePoints(sel, env);
    for (let i = pts.length - 1; i >= 0; i--) if (dist(p, pts[i]) <= HANDLE_PX) return { id: sel.id, handle: i };
  }
  for (let k = drawings.length - 1; k >= 0; k--) {
    const d = drawings[k];
    if (!d.hidden && hitsDrawing(d, p, env)) return { id: d.id, handle: null };
  }
  return null;
}

export function handlePoints(d: Drawing, env: Env): Pt[] {
  const pts = d.anchors.map(env.toPx);
  switch (d.type) {
    case "hline": return [{ x: Math.max(12, Math.min(env.w - 12, pts[0].x)), y: pts[0].y }];
    case "brush": case "highlighter": return [];
    case "long": case "short": {
      if (pts.length < 3) return pts;
      const [e, t, s] = pts;
      return [e, { x: e.x, y: t.y }, { x: e.x, y: s.y }, { x: t.x, y: e.y }];
    }
    case "regression": {
      const r = regression(env.timeline, env.bars, d.anchors[0].time, d.anchors[1]?.time ?? d.anchors[0].time);
      if (!r) return pts;
      return d.anchors.map((a) => env.toPx({ time: a.time, price: r.at(timeToLogical(env.timeline, a.time)) }));
    }
    case "avwap": {
      const v = vwapFrom(env.timeline, env.bars, d.anchors[0].time)[0];
      return [v ? env.toPx(v) : pts[0]];
    }
    default: return pts;
  }
}

export function moveHandle(d: Drawing, i: number, a: Anchor): Anchor[] {
  if (d.type === "long" || d.type === "short") {
    const [e, t, s] = d.anchors;
    if (i === 0) return [a, t, s];
    if (i === 1) return [e, { ...t, price: a.price }, s];
    if (i === 2) return [e, t, { ...s, price: a.price }];
    return [e, { ...t, time: a.time }, { ...s, time: a.time }];
  }
  return d.anchors.map((x, k) => (k === i ? a : x));
}

export function axisPrices(d: Drawing): boolean { return !["regression", "avwap", "fixedvp", "anchoredvp", "fibtime", "cyclic", "timecycles", "sine", "vline", "daterange"].includes(d.type); }
export function axisTimes(d: Drawing): boolean { return !["hline", "hray", "pricerange"].includes(d.type); }
