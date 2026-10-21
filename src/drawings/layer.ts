import type {
  IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, ISeriesPrimitiveAxisView,
  PrimitivePaneViewZOrder, SeriesAttachedParameter, SeriesType, Time,
} from "lightweight-charts";
import { placeMeasureLabel, timeToLogical, type Bars, type LabelRect, type Pt, type Timeline } from "./geometry";
import { axisPrices, axisTimes, FONT, handlePoints, line, paint, textWidth, withAlpha, type Env } from "./paint";
import { PRICE_LINE_TYPES, type Anchor, type Drawing } from "./types";
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
  bars(): Bars;
  volumeUnit(): string;
  formatPrice(p: number): string;
  pointerInside(): boolean;
}

export { textWidth, withAlpha };

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
      if (PRICE_LINE_TYPES.has(d.type) && d.style.showPrice !== false) priceOf(d.anchors[0]);
      if (d.type === "vline" || d.type === "crossline") timeOf(d.anchors[0]);
      if (selected && d.type !== "brush" && d.type !== "highlighter") for (const a of d.anchors) { if (axisPrices(d)) priceOf(a); if (axisTimes(d)) timeOf(a); }
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

  env(w: number, h: number): Env {
    return {
      toPx: (a) => this.toPx(a) ?? { x: -1e6, y: -1e6 }, w, h,
      formatPrice: (p) => this.src.formatPrice(p), formatTime: utcLabel,
      timeline: this.src.timeline(), bars: this.src.bars(), volumeUnit: this.src.volumeUnit(),
    };
  }

  private draw(target: Target) {
    if (!this.chart || !this.series) return;
    const hideAll = this.src.hideAll();
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const w = mediaSize.width, h = mediaSize.height, env = this.env(w, h);
      const sel = this.src.selectedId(), hov = this.src.hoverId();
      if (!hideAll) {
        for (const d of this.src.drawings()) if (!d.hidden) paint(ctx, d, env);
        const pv = this.src.preview();
        if (pv) paint(ctx, pv, env);
        for (const d of this.src.drawings()) {
          if (d.hidden || (d.id !== sel && d.id !== hov)) continue;
          this.drawHandles(ctx, d, env, d.id === sel);
        }
        if (pv) this.drawHandles(ctx, pv, env, true);
      }
      const m = this.src.measure();
      this.lastMeasureLabel = null;
      if (m) this.drawMeasure(ctx, m, w, h);
    });
  }

  private drawHandles(ctx: Ctx, d: Drawing, env: Env, selected: boolean) {
    ctx.save();
    ctx.setLineDash([]);
    if (d.type === "text") {
      const p = env.toPx(d.anchors[0]);
      const fs = d.style.fontSize ?? 14, lines = (d.style.text ?? "").split("\n").length;
      ctx.strokeStyle = d.style.color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.strokeRect(p.x - 3, p.y - 3, textWidth(d) + 6, lines * fs * 1.25 + 6);
      ctx.setLineDash([]);
    }
    if ((d.type === "brush" || d.type === "highlighter") && selected) {
      const pts = d.anchors.map(env.toPx);
      ctx.strokeStyle = withAlpha(d.style.color, 0.35); ctx.lineWidth = d.style.width + 6; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
    for (const p of handlePoints(d, env)) {
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
