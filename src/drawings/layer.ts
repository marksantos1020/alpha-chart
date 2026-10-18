import type {
  IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, ISeriesPrimitiveAxisView,
  PrimitivePaneViewZOrder, SeriesAttachedParameter, SeriesType, Time,
} from "lightweight-charts";
import { placeMeasureLabel, type LabelRect, channelOffset, extendSegment, fibExtPrice, fibPrice, handlePoints, timeToLogical, type Pt, type Timeline } from "./geometry";
import type { Anchor, Drawing } from "./types";
import { formatTime } from "../settings";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];
type Ctx = CanvasRenderingContext2D;

export interface MeasureInfo { a: Anchor; b: Anchor; lines: string[]; up: boolean }

export interface LayerSource {
  drawings(): Drawing[];
  selectedId(): string | null;
  hoverId(): string | null;
  preview(): Drawing | null;
  measure(): MeasureInfo | null;
  hideAll(): boolean;
  timeline(): Timeline;
  formatPrice(p: number): string;
  pointerInside(): boolean;
}

const FONT = '"IBM Plex Sans", system-ui, sans-serif';
let measureCtx: Ctx | null = null;
export function textWidth(d: Drawing): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return 80;
  measureCtx.font = `${d.style.fontSize ?? 14}px ${FONT}`;
  return Math.max(...(d.style.text ?? "").split("\n").map((l) => measureCtx!.measureText(l).width), 8);
}

function setLine(ctx: Ctx, color: string, width: number, style: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = style === "dotted" ? "round" : "butt";
  ctx.setLineDash(style === "dashed" ? [6 + width, 4 + width] : style === "dotted" ? [0.5, 3 + width] : []);
}
function line(ctx: Ctx, a: Pt, b: Pt) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

let labelZone = "UTC";
export function setLabelZone(tz: string) { labelZone = tz; }
function utcLabel(ms: number): string { return formatTime(ms, labelZone); }

class AxisLabel implements ISeriesPrimitiveAxisView {
  constructor(private c: number, private t: string, private bg: string) {}
  coordinate() { return this.c; }
  text() { return this.t; }
  textColor() { return "#ffffff"; }
  backColor() { return this.bg; }
  visible() { return true; }
  tickVisible() { return true; }
}

export class DrawingLayer implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private view: IPrimitivePaneView;
  private priceBand: IPrimitivePaneView[];
  private timeBand: IPrimitivePaneView[];
  private priceViews: AxisLabel[] = [];
  private timeViews: AxisLabel[] = [];
  lastMeasureLabel: LabelRect | null = null;
  lastBands: { price: [number, number] | null; time: [number, number] | null } = { price: null, time: null };
  private measureLabels: { price: string[]; time: string[] } = { price: [], time: [] };

  constructor(private src: LayerSource) {
    const renderer: IPrimitivePaneRenderer = { draw: (t: Target) => this.draw(t) };
    this.view = { zOrder: (): PrimitivePaneViewZOrder => "top", renderer: () => renderer };
    const band = (axis: "price" | "time"): IPrimitivePaneView[] => {
      const r: IPrimitivePaneRenderer = { draw: (t: Target) => this.drawAxisBand(t, axis) };
      return [{ zOrder: (): PrimitivePaneViewZOrder => "bottom", renderer: () => r }];
    };
    this.priceBand = band("price");
    this.timeBand = band("time");
  }

  attached(p: SeriesAttachedParameter<Time>) { this.chart = p.chart; this.series = p.series; this.request = p.requestUpdate; }
  detached() { this.chart = null; this.series = null; this.request = null; }
  paneViews() { return [this.view]; }
  priceAxisViews() { return this.priceViews; }
  timeAxisViews() { return this.timeViews; }
  axisState() { return { priceLabels: this.measureLabels.price.slice(), timeLabels: this.measureLabels.time.slice(), bands: { ...this.lastBands } }; }
  priceAxisPaneViews() { return this.priceBand; }
  timeAxisPaneViews() { return this.timeBand; }

  private drawAxisBand(target: Target, axis: "price" | "time") {
    const m = this.src.measure();
    this.lastBands[axis] = null;
    if (!m || m.lines.length === 0) return;
    const a = this.toPx(m.a), b = this.toPx(m.b);
    if (!a || !b) return;
    this.lastBands[axis] = axis === "price" ? [Math.min(a.y, b.y), Math.max(a.y, b.y)] : [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.save();
      ctx.fillStyle = withAlpha(m.up ? "#2962FF" : "#F23645", 0.22);
      if (axis === "price") ctx.fillRect(0, Math.min(a.y, b.y), mediaSize.width, Math.abs(b.y - a.y));
      else ctx.fillRect(Math.min(a.x, b.x), 0, Math.abs(b.x - a.x), mediaSize.height);
      ctx.restore();
    });
  }
  requestUpdate() { this.request?.(); }

  toPx(a: Anchor): Pt | null {
    const { chart, series } = this;
    if (!chart || !series) return null;
    const ts = chart.timeScale();
    const x0 = ts.logicalToCoordinate(0 as never), x1 = ts.logicalToCoordinate(1 as never);
    const y = series.priceToCoordinate(a.price);
    if (x0 === null || x1 === null || y === null) return null;
    return { x: x0 + timeToLogical(this.src.timeline(), a.time) * (x1 - x0), y };
  }

  updateAllViews() {
    this.priceViews = []; this.timeViews = []; this.measureLabels = { price: [], time: [] };
    if (!this.chart || !this.series || this.src.hideAll()) return;
    const sel = this.src.selectedId();
    const all = [...this.src.drawings(), ...(this.src.preview() ? [this.src.preview()!] : [])];
    for (const d of all) {
      if (d.hidden) continue;
      const selected = d.id === sel || d === this.src.preview();
      const priceOf = (a: Anchor) => { const y = this.series!.priceToCoordinate(a.price); if (y !== null) this.priceViews.push(new AxisLabel(y, this.src.formatPrice(a.price), d.style.color)); };
      const timeOf = (a: Anchor) => { const p = this.toPx(a); if (p) this.timeViews.push(new AxisLabel(p.x, utcLabel(a.time), d.style.color)); };
      if ((d.type === "hline" || d.type === "hray" || d.type === "crossline") && d.style.showPrice !== false) priceOf(d.anchors[0]);
      if (d.type === "vline" || d.type === "crossline") timeOf(d.anchors[0]);
      if (selected && d.type !== "brush") for (const a of d.anchors) { priceOf(a); if (d.type !== "hline" && d.type !== "hray") timeOf(a); }
    }
    const m = this.src.measure();
    if (m) {
      const color = m.up ? "#2962FF" : "#F23645";
      for (const a of [m.a, m.b]) {
        const y = this.series.priceToCoordinate(a.price);
        if (y !== null) { const txt = this.src.formatPrice(a.price); this.priceViews.push(new AxisLabel(y, txt, color)); this.measureLabels.price.push(txt); }
      }
      if (m.lines.length && this.src.pointerInside()) for (const a of [m.a, m.b]) {
        const p = this.toPx(a);
        if (p) { const txt = utcLabel(a.time); this.timeViews.push(new AxisLabel(p.x, txt, color)); this.measureLabels.time.push(txt); }
      }
    }
  }

  private draw(target: Target) {
    if (!this.chart || !this.series) return;
    const hideAll = this.src.hideAll();
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const w = mediaSize.width, h = mediaSize.height;
      const sel = this.src.selectedId(), hov = this.src.hoverId();
      if (!hideAll) {
        for (const d of this.src.drawings()) if (!d.hidden) this.drawOne(ctx, d, w, h);
        const pv = this.src.preview();
        if (pv) this.drawOne(ctx, pv, w, h);
        for (const d of this.src.drawings()) {
          if (d.hidden || (d.id !== sel && d.id !== hov)) continue;
          this.drawHandles(ctx, d, w, d.id === sel);
        }
        if (pv) this.drawHandles(ctx, pv, w, true);
      }
      const m = this.src.measure();
      this.lastMeasureLabel = null;
      if (m) this.drawMeasure(ctx, m, w, h);
    });
  }

  private pts(d: Drawing): Pt[] | null {
    const out: Pt[] = [];
    for (const a of d.anchors) { const p = this.toPx(a); if (!p) return null; out.push(p); }
    return out;
  }

  private drawOne(ctx: Ctx, d: Drawing, w: number, h: number) {
    const pts = this.pts(d);
    if (!pts || pts.length === 0) return;
    const s = d.style;
    ctx.save();
    setLine(ctx, s.color, s.width, s.lineStyle);
    switch (d.type) {
      case "trend": case "arrow": case "ray": case "extended": {
        if (pts.length < 2) break;
        const left = d.type === "extended" || (d.type === "trend" && !!s.extendLeft);
        const right = d.type === "extended" || d.type === "ray" || (d.type === "trend" && !!s.extendRight);
        const [a, b] = extendSegment(pts[0], pts[1], w, h, left, right);
        line(ctx, a, b);
        if (d.type === "arrow") {
          const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x), L = 8 + 2 * s.width;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(pts[1].x - L * Math.cos(ang - 0.45), pts[1].y - L * Math.sin(ang - 0.45));
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.lineTo(pts[1].x - L * Math.cos(ang + 0.45), pts[1].y - L * Math.sin(ang + 0.45));
          ctx.stroke();
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
      case "rect": {
        if (pts.length < 2) break;
        const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y), rw = Math.abs(pts[1].x - pts[0].x), rh = Math.abs(pts[1].y - pts[0].y);
        if (s.fillVisible && s.fill) { ctx.fillStyle = s.fill; ctx.fillRect(x, y, rw, rh); }
        ctx.strokeRect(x, y, rw, rh);
        break;
      }
      case "channel": {
        if (pts.length < 2) break;
        line(ctx, pts[0], pts[1]);
        if (pts.length < 3) break;
        const off = channelOffset(pts);
        const a2 = { x: pts[0].x, y: pts[0].y + off }, b2 = { x: pts[1].x, y: pts[1].y + off };
        if (s.fillVisible && s.fill) {
          ctx.fillStyle = s.fill;
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y); ctx.closePath(); ctx.fill();
        }
        line(ctx, a2, b2);
        setLine(ctx, s.color, 1, "dashed");
        line(ctx, { x: pts[0].x, y: pts[0].y + off / 2 }, { x: pts[1].x, y: pts[1].y + off / 2 });
        break;
      }
      case "fib": case "fibext": this.drawFib(ctx, d, pts, w); break;
      case "brush":
        if (pts.length < 2) break;
        ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        break;
      case "text": {
        const fs = s.fontSize ?? 14;
        ctx.font = `${fs}px ${FONT}`;
        ctx.fillStyle = s.textColor ?? s.color;
        ctx.textBaseline = "top";
        (s.text ?? "").split("\n").forEach((l, i) => ctx.fillText(l, pts[0].x, pts[0].y + i * fs * 1.25));
        break;
      }
    }
    ctx.restore();
  }

  private drawFib(ctx: Ctx, d: Drawing, pts: Pt[], w: number) {
    const s = d.style;
    if (pts.length < 2) return;
    if (d.type === "fibext" && pts.length < 3) { setLine(ctx, s.color, 1, "dashed"); line(ctx, pts[0], pts[1]); return; }
    const x0 = d.type === "fib" ? Math.min(pts[0].x, pts[1].x) : pts[2].x;
    const x1 = s.extendRight ? w : d.type === "fib" ? Math.max(pts[0].x, pts[1].x) : pts[2].x + Math.abs(pts[1].x - pts[0].x);
    const levels = (s.levels ?? []).filter((l) => l.visible).slice().sort((a, b) => a.value - b.value);
    const y = (lv: number) => this.series!.priceToCoordinate(d.type === "fib" ? fibPrice(d.anchors, lv, s.reverse) : fibExtPrice(d.anchors, lv)) ?? 0;
    if (s.fillVisible) {
      for (let i = 0; i + 1 < levels.length; i++) {
        const ya = y(levels[i].value), yb = y(levels[i + 1].value);
        ctx.fillStyle = withAlpha(levels[i + 1].color, 0.12);
        ctx.fillRect(x0, Math.min(ya, yb), x1 - x0, Math.abs(yb - ya));
      }
    }
    ctx.font = `11px ${FONT}`;
    ctx.textBaseline = "bottom";
    for (const lv of levels) {
      const yy = y(lv.value);
      setLine(ctx, lv.color, s.width, s.lineStyle);
      line(ctx, { x: x0, y: yy }, { x: x1, y: yy });
      if (s.showLabels !== false) {
        const price = d.type === "fib" ? fibPrice(d.anchors, lv.value, s.reverse) : fibExtPrice(d.anchors, lv.value);
        ctx.fillStyle = lv.color;
        const label = `${lv.value} (${this.src.formatPrice(price)})`;
        ctx.fillText(label, x0 - ctx.measureText(label).width - 4, yy + 5);
      }
    }
    setLine(ctx, "#787B86", 1, "dashed");
    line(ctx, pts[0], pts[1]);
    if (d.type === "fibext") line(ctx, pts[1], pts[2]);
  }

  private drawHandles(ctx: Ctx, d: Drawing, w: number, selected: boolean) {
    const pts = this.pts(d);
    if (!pts) return;
    ctx.save();
    ctx.setLineDash([]);
    if (d.type === "text") {
      const fs = d.style.fontSize ?? 14, lines = (d.style.text ?? "").split("\n").length;
      ctx.strokeStyle = d.style.color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.strokeRect(pts[0].x - 3, pts[0].y - 3, textWidth(d) + 6, lines * fs * 1.25 + 6);
    }
    if (d.type === "brush" && selected) {
      ctx.strokeStyle = withAlpha(d.style.color, 0.35); ctx.lineWidth = d.style.width + 6; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
    const toPx = (a: Anchor) => this.toPx(a) ?? { x: -100, y: -100 };
    for (const p of handlePoints(d, toPx, w)) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, selected ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = selected ? "#ffffff" : "rgba(255,255,255,0.7)";
      ctx.strokeStyle = d.style.color;
      ctx.lineWidth = 1.5;
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  private drawMeasure(ctx: Ctx, m: MeasureInfo, w: number, h: number) {
    const a = this.toPx(m.a), b = this.toPx(m.b);
    if (!a || !b) return;
    const color = m.up ? "#2962FF" : "#F23645";
    ctx.save();
    ctx.fillStyle = withAlpha(color, 0.18);
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([]);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    line(ctx, { x: mx, y: a.y }, { x: mx, y: b.y });
    line(ctx, { x: a.x, y: my }, { x: b.x, y: my });
    const head = (tip: Pt, dx: number, dy: number) => {
      const s = 6;
      ctx.beginPath();
      ctx.moveTo(tip.x - dx * s - dy * s * 0.75, tip.y - dy * s + dx * s * 0.75);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(tip.x - dx * s + dy * s * 0.75, tip.y - dy * s - dx * s * 0.75);
      ctx.stroke();
    };
    if (Math.abs(b.y - a.y) > 12) head({ x: mx, y: b.y }, 0, Math.sign(b.y - a.y));
    if (Math.abs(b.x - a.x) > 12) head({ x: b.x, y: my }, Math.sign(b.x - a.x), 0);
    ctx.font = `12px ${FONT}`;
    if (!m.lines.length) { ctx.restore(); return; }
    const tw = Math.max(...m.lines.map((l) => ctx.measureText(l).width)) + 16, th = m.lines.length * 16 + 8;
    const lab = placeMeasureLabel(a, b, { w: tw, h: th }, { w, h }, m.up);
    this.lastMeasureLabel = lab;
    const bx = lab.x, by = lab.y;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect?.(bx, by, tw, th, 4); if (!ctx.roundRect) ctx.rect(bx, by, tw, th); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.textBaseline = "top"; ctx.textAlign = "center";
    m.lines.forEach((l, i) => ctx.fillText(l, bx + tw / 2, by + 4 + i * 16));
    ctx.restore();
  }
}

export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (m) { const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`; }
  const r = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (r) { const [x, y, z] = r[1].split(",").map((v) => v.trim()); return `rgba(${x},${y},${z},${alpha})`; }
  return color;
}
