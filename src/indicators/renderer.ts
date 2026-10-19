import {
  AreaSeries, BaselineSeries, HistogramSeries, LineSeries, LineStyle, LineType,
  type IChartApi, type IPriceLine, type ISeriesApi, type PriceFormat, type SeriesType, type UTCTimestamp,
} from "lightweight-charts";
import { BandPrimitive } from "./bandPrimitive";
import { BgPrimitive } from "./bgPrimitive";
import { ValueLabels, type ValueLabel } from "../valueLabels";
import type { BandFrame, HLine, IndicatorFrame, PlotFrame, PlotStyle } from "./types";

export interface RenderItem {
  id: string;
  visible: boolean;
  frame: IndicatorFrame | null;
  paneFor: (scriptPane: number) => number;
  style: Record<string, PlotStyle>;
  priceFormat: PriceFormat;
}

const MAX_POINTS = 20_000;

const LINE_STYLE: Record<string, LineStyle> = { solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted };

export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (m) {
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  return color;
}

type Pt = { time: UTCTimestamp; value: number; color?: string } | { time: UTCTimestamp };

export function toPoints(times: Float64Array, values: Float64Array, colorAt?: (i: number, v: number) => string | undefined): Pt[] {
  const out: Pt[] = [];
  const n = Math.min(times.length, values.length);
  let lastT = -1;
  const push = (i: number) => {
    const t = Math.floor(times[i] / 1000);
    if (t <= lastT) return;
    lastT = t;
    const v = values[i];
    if (!Number.isFinite(v)) { out.push({ time: t as UTCTimestamp }); return; }
    const c = colorAt?.(i, v);
    out.push(c ? { time: t as UTCTimestamp, value: v, color: c } : { time: t as UTCTimestamp, value: v });
  };
  if (n <= MAX_POINTS) { for (let i = 0; i < n; i++) push(i); return out; }
  const step = Math.ceil(n / MAX_POINTS);
  for (let s = 0; s < n; s += step) {
    const e = Math.min(n, s + step);
    let iMin = -1, iMax = -1;
    for (let i = s; i < e; i++) {
      const v = values[i];
      if (!Number.isFinite(v)) continue;
      if (iMin < 0 || v < values[iMin]) iMin = i;
      if (iMax < 0 || v > values[iMax]) iMax = i;
    }
    if (iMin < 0) push(s); else if (iMin === iMax) push(iMin); else if (iMin < iMax) { push(iMin); push(iMax); } else { push(iMax); push(iMin); }
  }
  push(n - 1);
  return out;
}

interface PlotHandle { api: ISeriesApi<SeriesType>; plot: PlotFrame; index: number; pane: number; label: boolean; color: string; colorAt?: (i: number, v: number) => string | undefined }
interface ItemHandle {
  plots: PlotHandle[]; bands: { prim: BandPrimitive; host: ISeriesApi<SeriesType> }[];
  bgs: { prim: BgPrimitive; host: ISeriesApi<SeriesType> }[]; lines: { host: ISeriesApi<SeriesType>; line: IPriceLine; h: HLine }[];
}

export interface ViewEnd { timeMs: number; latest: boolean }

export class IndicatorRenderer {
  private handles = new Map<string, ItemHandle>();
  private signature = "";
  private candleUp: (timeMs: number) => boolean | undefined = () => undefined;
  private paneLabels: { prim: ValueLabels; host: ISeriesApi<SeriesType> }[] = [];
  private viewEnd: () => ViewEnd | null = () => null;
  private front: () => ISeriesApi<SeriesType> | null = () => null;
  private afterBuild: () => void = () => undefined;
  private selected: string | null = null;

  constructor(private chart: IChartApi, private background: () => string = () => "#151b23") {}

  setCandleDirection(fn: (timeMs: number) => boolean | undefined) { this.candleUp = fn; }
  setViewEnd(fn: () => ViewEnd | null) { this.viewEnd = fn; }
  setFront(fn: () => ISeriesApi<SeriesType> | null) { this.front = fn; }
  setAfterBuild(fn: () => void) { this.afterBuild = fn; }
  setSelected(id: string | null) { this.selected = id; }

  itemOf(api: ISeriesApi<SeriesType>): string | null {
    for (const [id, h] of this.handles) if (h.plots.some((p) => p.api === api)) return id;
    return null;
  }

  seriesOf(id: string): ISeriesApi<SeriesType>[] {
    return (this.handles.get(id)?.plots ?? []).filter((p) => p.api.options().visible).map((p) => p.api);
  }

  bringToFront() {
    const s = this.front();
    if (s) s.setSeriesOrder(s.getPane().getSeries().length - 1);
  }

  private sig(items: RenderItem[]): string {
    return items.map((it) => {
      const f = it.frame;
      if (!f) return `${it.id}:-`;
      const plots = f.plots.map((p) => `${p.title}|${p.style}|${p.display}|${it.paneFor(p.pane)}`).join(",");
      const bands = f.bands.map((b) => b.title).join(",") + `|bg${f.bgcolors.length}`;
      const lines = f.hlines.map((h) => `${h.value}|${it.paneFor(h.pane ?? (f.plots[0]?.pane ?? 0))}`).join(",");
      return `${it.id}:[${plots}][${bands}][${lines}]`;
    }).join(";");
  }

  sync(items: RenderItem[]) {
    const sig = this.sig(items);
    if (sig !== this.signature) {
      this.clear();
      this.build(items);
      this.signature = sig;
    }
    for (const it of items) this.apply(it);
  }

  private clear() {
    for (const l of this.paneLabels) { try { l.host.detachPrimitive(l.prim); } catch {} }
    this.paneLabels = [];
    for (const h of this.handles.values()) {
      for (const b of h.bands) { try { b.host.detachPrimitive(b.prim); } catch {} }
      for (const b of h.bgs) { try { b.host.detachPrimitive(b.prim); } catch {} }
      for (const l of h.lines) { try { l.host.removePriceLine(l.line); } catch {} }
      for (const p of h.plots) { try { this.chart.removeSeries(p.api); } catch {} }
    }
    this.handles.clear();
  }

  private build(items: RenderItem[]) {
    const wanted: { it: RenderItem; p: PlotFrame; index: number; pane: number }[] = [];
    for (const it of items) it.frame?.plots.forEach((p, index) => wanted.push({ it, p, index, pane: it.paneFor(p.pane) }));
    wanted.sort((a, b) => a.pane - b.pane);
    for (const it of items) this.handles.set(it.id, { plots: [], bands: [], bgs: [], lines: [] });
    for (const w of wanted) {
      const api = this.addSeries(w.p, w.pane);
      this.handles.get(w.it.id)!.plots.push({ api, plot: w.p, index: w.index, pane: w.pane, label: false, color: w.p.color });
    }
    const firstIn = new Map<number, ISeriesApi<SeriesType>>();
    for (const h of this.handles.values()) for (const p of h.plots) if (p.pane > 0 && !firstIn.has(p.pane)) firstIn.set(p.pane, p.api);
    for (const [pane, host] of firstIn) {
      const prim = new ValueLabels({ labels: () => this.labelsFor(pane), background: this.background });
      host.attachPrimitive(prim);
      this.paneLabels.push({ prim, host });
    }
    for (const it of items) {
      const h = this.handles.get(it.id)!;
      const f = it.frame;
      if (!f || h.plots.length === 0) continue;
      const hostIn = (pane: number) => h.plots.find((p) => p.pane === pane)?.api ?? h.plots[0].api;
      const defaultPane = h.plots[0].pane;
      for (const bg of f.bgcolors) {
        const host = hostIn(defaultPane);
        const prim = new BgPrimitive({ times: bg.times, color: bg.color, visible: true });
        host.attachPrimitive(prim);
        h.bgs.push({ prim, host });
      }
      for (const b of f.bands) {
        const host = hostIn(defaultPane);
        const prim = new BandPrimitive({ times: b.times, upper: b.upper, lower: b.lower, color: b.color, visible: true });
        host.attachPrimitive(prim);
        h.bands.push({ prim, host });
      }
      for (const hl of f.hlines) {
        const host = hl.pane !== undefined ? hostIn(it.paneFor(hl.pane)) : hostIn(defaultPane);
        const line = host.createPriceLine({ price: hl.value, color: hl.color ?? "#787B86", lineWidth: (hl.width ?? 1) as 1, lineStyle: LINE_STYLE[hl.style ?? "dashed"] ?? LineStyle.Dashed, axisLabelVisible: false, title: "" });
        h.lines.push({ host, line, h: hl });
      }
    }
    const panes = this.chart.panes();
    panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));
    this.bringToFront();
    this.afterBuild();
  }

  private addSeries(p: PlotFrame, pane: number): ISeriesApi<SeriesType> {
    const common = { priceLineVisible: false, lastValueVisible: false, title: "", crosshairMarkerVisible: false };
    switch (p.style) {
      case "area":
        return this.chart.addSeries(AreaSeries, { ...common }, pane) as ISeriesApi<SeriesType>;
      case "histogram":
      case "columns":
        return this.chart.addSeries(HistogramSeries, { ...common, base: 0 }, pane) as ISeriesApi<SeriesType>;
      case "baseline":
        return this.chart.addSeries(BaselineSeries, { ...common }, pane) as ISeriesApi<SeriesType>;
      default:
        return this.chart.addSeries(LineSeries, { ...common }, pane) as ISeriesApi<SeriesType>;
    }
  }

  private colorFn(p: PlotFrame, st: PlotStyle | undefined) {
    const up = st?.colorUp ?? p.colorUp, down = st?.colorDown ?? p.colorDown;
    if (!(p.style === "histogram" || p.style === "columns") || (!up && !down)) return undefined;
    if (p.colorBy === "candle") return (i: number, _v: number) => { const u = this.candleUp(p.times[i]); return u === undefined ? undefined : u ? up : down; };
    return (_i: number, v: number) => (v >= 0 ? up : down);
  }

  private options(p: PlotFrame, st: PlotStyle | undefined, visible: boolean, priceFormat: PriceFormat) {
    const color = st?.color ?? p.color;
    const width = (st?.width ?? p.width ?? 1) as 1 | 2 | 3 | 4;
    const lineStyle = LINE_STYLE[st?.lineStyle ?? p.lineStyle] ?? LineStyle.Solid;
    const shown = visible && st?.visible !== false && p.display !== "none" && p.display !== "legend";
    const base = { visible: shown, priceFormat, lastValueVisible: false };
    switch (p.style) {
      case "area": return { ...base, lineColor: color, lineWidth: width, lineStyle, topColor: withAlpha(color, 0.28), bottomColor: withAlpha(color, 0.02) };
      case "histogram": case "columns": return { ...base, color };
      case "baseline": {
        const up = st?.colorUp ?? p.colorUp ?? "#26A69A", down = st?.colorDown ?? p.colorDown ?? "#EF5350";
        return { ...base, baseValue: { type: "price" as const, price: p.baseValue ?? 0 }, lineWidth: width, topLineColor: up, bottomLineColor: down,
                 topFillColor1: withAlpha(up, 0.28), topFillColor2: withAlpha(up, 0.05), bottomFillColor1: withAlpha(down, 0.05), bottomFillColor2: withAlpha(down, 0.28) };
      }
      case "circles": case "cross":
        return { ...base, color, lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: width + 1, lineWidth: width };
      default:
        return { ...base, color, lineWidth: width, lineStyle, lineType: p.style === "step" ? LineType.WithSteps : LineType.Simple };
    }
  }

  private apply(it: RenderItem) {
    const h = this.handles.get(it.id);
    if (!h || !it.frame) return;
    const f = it.frame;
    for (const ph of h.plots) {
      const p = f.plots[ph.index];
      if (!p) continue;
      ph.plot = p;
      const st = it.style[p.title];
      ph.label = it.visible && st?.visible !== false && p.display !== "none" && p.display !== "legend" && p.display !== "pane";
      ph.color = p.style === "baseline" ? "" : st?.color ?? p.color;
      ph.colorAt = this.colorFn(p, st) ?? (p.style === "baseline"
        ? ((_i: number, v: number) => (v >= (p.baseValue ?? 0) ? st?.colorUp ?? p.colorUp ?? "#26A69A" : st?.colorDown ?? p.colorDown ?? "#EF5350"))
        : undefined);
      ph.api.applyOptions(this.options(p, st, it.visible, it.priceFormat) as any);
      ph.api.setData(toPoints(p.times, p.values, this.colorFn(p, st)) as any);
    }
    h.bgs.forEach((b, i) => {
      const bg = f.bgcolors[i];
      if (bg) b.prim.set({ times: bg.times, color: bg.color, visible: it.visible });
    });
    h.bands.forEach((b, i) => {
      const bf: BandFrame | undefined = f.bands[i];
      if (!bf) return;
      const st = it.style[`fill:${bf.title}`];
      b.prim.set({ times: bf.times, upper: bf.upper, lower: bf.lower, color: st?.color ?? bf.color, visible: it.visible && st?.visible !== false });
    });
    for (const l of h.lines) {
      const st = it.style[`hline:${l.h.title ?? l.h.value}`];
      const show = it.visible && st?.visible !== false;
      l.line.applyOptions({ lineVisible: show, color: st?.color ?? l.h.color ?? "#787B86" });
    }
  }

  tail(it: RenderItem, times: number[]) {
    const h = this.handles.get(it.id);
    if (!h || !it.frame) return;
    for (const ph of h.plots) {
      const p = it.frame.plots[ph.index];
      if (!p) continue;
      ph.plot = p;
      const colorAt = this.colorFn(p, it.style[p.title]);
      for (const t of times) {
        let i = p.times.length - 1;
        while (i >= 0 && p.times[i] > t) i--;
        if (i < 0 || p.times[i] !== t) continue;
        const v = p.values[i];
        const time = Math.floor(t / 1000) as UTCTimestamp;
        try {
          if (Number.isFinite(v)) { const c = colorAt?.(i, v); ph.api.update((c ? { time, value: v, color: c } : { time, value: v }) as any); }
          else ph.api.update({ time } as any);
        } catch {}
      }
    }
    h.bands.forEach((b, i) => { const bf = it.frame!.bands[i]; if (bf) b.prim.set({ ...b.prim.data, times: bf.times, upper: bf.upper, lower: bf.lower }); });
    h.bgs.forEach((b, i) => { const bg = it.frame!.bgcolors[i]; if (bg) b.prim.set({ ...b.prim.data, times: bg.times }); });
  }

  clearData() {
    const none = new Float64Array(0);
    for (const h of this.handles.values()) {
      for (const p of h.plots) { try { p.api.setData([]); } catch {} }
      for (const b of h.bands) b.prim.set({ ...b.prim.data, times: none, upper: none, lower: none });
      for (const b of h.bgs) b.prim.set({ ...b.prim.data, times: [] });
    }
  }

  labelsFor(pane: number): ValueLabel[] {
    const out: ValueLabel[] = [];
    const end = this.viewEnd(), filled = !end || end.latest;
    for (const [id, h] of this.handles) {
      for (const ph of h.plots) {
        if (ph.pane !== pane || !ph.label) continue;
        const v = ph.plot.values, t = ph.plot.times;
        let i = v.length - 1;
        if (end && !end.latest) while (i >= 0 && t[i] > end.timeMs) i--;
        while (i >= 0 && !Number.isFinite(v[i])) i--;
        if (i < 0) continue;
        const y = ph.api.priceToCoordinate(v[i]);
        if (y === null) continue;
        const color = ph.colorAt?.(i, v[i]) || ph.color || "#787B86";
        out.push({ y, text: ph.api.priceFormatter().format(v[i]), color, filled, mark: id === this.selected });
      }
    }
    return out;
  }

  paneOf(id: string): number | null { return this.handles.get(id)?.plots[0]?.pane ?? null; }

  destroy() { this.clear(); this.signature = ""; }
}
