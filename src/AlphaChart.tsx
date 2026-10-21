import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  LineSeries,
  LineType,
  MismatchDirection,
  PriceScaleMode,
  CrosshairMode,
  HistogramSeries,
  createChart,
  createSeriesMarkers,
  type AutoscaleInfo,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesType,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Bar, ChartStorage, Datafeed, IndicatorEngine, OverlayFrame, StudyEntry } from "./types";
import { fmtPrice, fmtNum, priceDecimals } from "./format";
import { uid } from "./uid";
import { IndicatorRenderer, type RenderItem } from "./indicators/renderer";
import { useIndicators, type IndicatorEvents } from "./indicators/useIndicators";
import { formatValue, indexAt, legendTitle, plotColorAt, precisionFor, priceFormatFor } from "./indicators/format";
import type { IndicatorInstance, PlotFrame } from "./indicators/types";
import IndicatorPicker from "./indicators/IndicatorPicker";
import IndicatorRow, { ContextMenu, IndicatorMenuItems, LoadingDots, type RowValue } from "./indicators/IndicatorRow";
import { SelectionMarks } from "./selection";
import SettingsDialog from "./indicators/SettingsDialog";
import TemplatesMenu from "./indicators/TemplatesMenu";
import { DrawingController, type Bars } from "./drawings/controller";
import { useDrawings, type DrawingsStore } from "./drawings/useDrawings";
import Toolbar from "./drawings/Toolbar";
import FavoritesBar from "./drawings/FavoritesBar";
import DrawingSettings from "./drawings/DrawingSettings";
import DrawingMenu from "./drawings/DrawingMenu";
import type { Drawing } from "./drawings/types";
import { setLabelZone } from "./drawings/layer";
import { DEFAULT_SETTINGS, normalizeSettings, formatTick, formatTime, heikinAshi, loadSettings, saveSettings, type BarStyle, type ChartSettings } from "./settings";
import BottomBar, { type RangeKey } from "./BottomBar";
import ChartSettingsDialog from "./ChartSettingsDialog";
import GoToDate from "./GoToDate";
import { countdownText, type BlockClock } from "./countdown";
import { ValueLabels, type ValueLabel } from "./valueLabels";
import { useLayout, type LayoutDoc } from "./useLayout";
import { INTERVAL_MS, useDatafeed } from "./useDatafeed";
import { localChartStorage } from "./localStorage";
import { HlcArea } from "./hlcArea";
import ChartTypeMenu from "./ChartTypeMenu";
import { Chevron, IndicatorsIcon, LegendIcons, RedoIcon, UndoIcon } from "./icons";
import { canvasColors, useDocumentTheme, useResolvedTheme, type CanvasColors, type ThemeMode } from "./theme";

export interface AlphaChartProps {
  datafeed: Datafeed;
  symbol: string;
  interval: string;
  onInterval?: (interval: string) => void;
  intervals?: string[];
  name?: string;
  engine?: IndicatorEngine;
  storage?: ChartStorage;
  overlay?: OverlayFrame | null;
  legendRows?: ReactNode;
  onAddStrategy?: (entry: StudyEntry) => void;
  pickerRequest?: { seq: number; category?: string } | null;
  toolbar?: ReactNode;
  actions?: ReactNode;
  volumeUnit?: string;
  barInfo?: (bar: Bar) => ReactNode;
  barInfoLabel?: string;
  block?: BlockClock;
  theme?: ThemeMode;
  onIndicatorSource?: (libraryId: string) => void;
  onThemeChange?: (mode: ThemeMode) => void;
  debug?: boolean;
}

export interface AlphaChartHandle {
  goTo(ms: number): void;
  showRange(range: RangeKey): void;
}

const DEFAULT_STORAGE = localChartStorage();
const isDev = () => !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
const isClosed = (b: Bar, last: boolean) => b.closed ?? !last;

const VOL_KEY = "alpha.chart.volume.v1";
export const INITIAL_BARS = 200;
const IV_LABEL: Record<string, string> = { "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m", "60": "1h", "120": "2h", "240": "4h", D: "1D", W: "1W" };
const IV_MS = INTERVAL_MS;

type MainKind = "candle" | "bar" | "line" | "area" | "baseline" | "columns";
const KIND: Record<BarStyle, MainKind> = {
  bars: "bar", candles: "candle", hollow: "candle", heikin: "candle", highlow: "candle",
  line: "line", linemarkers: "line", step: "line", hlcarea: "line", area: "area", baseline: "baseline", columns: "columns",
};
function mainKind(style: BarStyle): MainKind { return KIND[style] ?? "candle"; }
type Autoscale = (original: () => AutoscaleInfo | null) => AutoscaleInfo | null;
function createMain(c: IChartApi, style: BarStyle, autoscaleInfoProvider: Autoscale): ISeriesApi<SeriesType> {
  const base = { priceFormat: { type: "price" as const, precision: 6, minMove: 0.000001 }, autoscaleInfoProvider };
  switch (mainKind(style)) {
    case "columns": return c.addSeries(HistogramSeries, { ...base, base: 0 }) as ISeriesApi<SeriesType>;
    case "bar": return c.addSeries(BarSeries, base) as ISeriesApi<SeriesType>;
    case "line": return c.addSeries(LineSeries, base) as ISeriesApi<SeriesType>;
    case "area": return c.addSeries(AreaSeries, base) as ISeriesApi<SeriesType>;
    case "baseline": return c.addSeries(BaselineSeries, base) as ISeriesApi<SeriesType>;
    default: return c.addSeries(CandlestickSeries, base) as ISeriesApi<SeriesType>;
  }
}
function alpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function themeOptions(t: CanvasColors) {
  const line = { color: t.crosshair, labelBackgroundColor: t.crosshairLabel };
  return {
    layout: { textColor: t.text, panes: { separatorColor: t.border, separatorHoverColor: t.separatorHover } },
    grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
    rightPriceScale: { borderColor: t.border },
    leftPriceScale: { borderColor: t.border },
    timeScale: { borderColor: t.border },
    crosshair: { vertLine: line, horzLine: line },
  };
}
const HIGH_LOW = "#2962FF";
function mainOptions(s: ChartSettings, base: number) {
  const up = s.upColor, down = s.downColor;
  const common = { priceLineVisible: s.lastPriceLine, lastValueVisible: false };
  switch (mainKind(s.barStyle)) {
    case "bar": return { ...common, upColor: up, downColor: down, thinBars: false };
    case "line": {
      const hlc = s.barStyle === "hlcarea";
      return { ...common, color: hlc ? "#868993" : up, lineWidth: (hlc ? 1 : 2) as 1 | 2, lineType: s.barStyle === "step" ? LineType.WithSteps : LineType.Simple,
               pointMarkersVisible: s.barStyle === "linemarkers", pointMarkersRadius: 3 };
    }
    case "columns": return { ...common, color: up };
    case "area": return { ...common, lineColor: up, lineWidth: 2 as const, topColor: alpha(up, 0.35), bottomColor: alpha(up, 0.02) };
    case "baseline": return { ...common, baseValue: { type: "price" as const, price: base }, topLineColor: up, bottomLineColor: down,
                              topFillColor1: alpha(up, 0.28), topFillColor2: alpha(up, 0.05), bottomFillColor1: alpha(down, 0.05), bottomFillColor2: alpha(down, 0.28) };
    default: {
      if (s.barStyle === "highlow") return { ...common, upColor: alpha(HIGH_LOW, 0.25), downColor: alpha(HIGH_LOW, 0.25), borderVisible: true,
                                             borderUpColor: HIGH_LOW, borderDownColor: HIGH_LOW, wickVisible: false };
      const hollow = s.barStyle === "hollow";
      return { ...common, upColor: hollow ? "rgba(0,0,0,0)" : up, downColor: down, borderVisible: s.borders || hollow,
               borderUpColor: up, borderDownColor: down, wickVisible: s.wicks, wickUpColor: up, wickDownColor: down };
    }
  }
}

export function parseInterval(t: string): string | null {
  const m = /^(\d+)([mhdw]?)$/i.exec(t.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10), u = m[2].toLowerCase();
  if (!n) return null;
  if (u === "d") return n === 1 ? "D" : null;
  if (u === "w") return n === 1 ? "W" : null;
  const minutes = u === "h" ? n * 60 : n;
  return String(minutes);
}

function toBar(c: Bar) {
  return { time: Math.floor(c.time / 1000) as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close };
}
function highLow(c: Bar) {
  return { time: Math.floor(c.time / 1000) as UTCTimestamp, open: c.high, high: c.high, low: c.low, close: c.low };
}

const SHAPES: Record<string, SeriesMarker<Time>["shape"]> = { triangleUp: "arrowUp", triangleDown: "arrowDown", arrowUp: "arrowUp", arrowDown: "arrowDown", circle: "circle", square: "square", label: "circle" };

function lowerBound(times: ArrayLike<number>, t: number): number {
  let lo = 0, hi = times.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < t) lo = m + 1; else hi = m; }
  return lo;
}

function clipFrame(f: OverlayFrame | null | undefined, fromMs: number | undefined): OverlayFrame | null {
  if (!f || fromMs === undefined) return null;
  const cut = <T extends { times: Float64Array }>(x: T, keys: string[]): T => {
    const i = lowerBound(x.times, fromMs);
    if (i === 0) return x;
    const out: any = { ...x, times: x.times.subarray(i) };
    for (const k of keys) out[k] = (x as any)[k].subarray(i);
    return out;
  };
  return {
    ...f,
    plots: f.plots.map((p) => cut(p, ["values"])),
    bands: (f.bands ?? []).map((b) => cut(b, ["upper", "lower"])),
    shapes: f.shapes.filter((x) => x.time >= fromMs),
    bgcolors: f.bgcolors.map((b) => ({ ...b, times: b.times.filter((t) => t >= fromMs) })),
  };
}

function overlayFrame(f: OverlayFrame | null | undefined): OverlayFrame | null {
  if (!f) return null;
  return { ...f, plots: f.plots.map((p) => ({ ...p, lineStyle: p.lineStyle ?? "solid", display: p.display ?? "all" }) as PlotFrame), bands: f.bands ?? [] };
}

const AlphaChart = forwardRef<AlphaChartHandle, AlphaChartProps>(function AlphaChart(
  { datafeed, symbol, interval, onInterval, intervals, name, engine, storage = DEFAULT_STORAGE, overlay, legendRows, onAddStrategy, pickerRequest,
    toolbar, actions, volumeUnit, barInfo, barInfoLabel, block, theme, onThemeChange, onIndicatorSource, debug }, ref) {
  const resolvedTheme = useResolvedTheme(theme);
  const documentTheme = useDocumentTheme();
  const feed = useDatafeed(datafeed, symbol, interval, onInterval, intervals);
  const { bars: candles, dataSeq, loading, fetching } = feed;
  const onNeedOlder = feed.loadOlder, viewRequest = feed.viewRequest;
  useImperativeHandle(ref, () => ({ goTo: feed.goTo, showRange: feed.showRange }), [feed.goTo, feed.showRange]);
  const blockRef = useRef(block); blockRef.current = block;
  const volumeUnitRef = useRef(volumeUnit); volumeUnitRef.current = volumeUnit;
  const firstCandleMs = candles.length ? candles[0].time : undefined;
  const frame = useMemo(() => clipFrame(overlay, firstCandleMs), [overlay, firstCandleMs]);
  const el = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<SeriesType> | null>(null);
  const mainStyle = useRef<BarStyle>("candles");
  const priceLabels = useRef<ValueLabels | null>(null);
  const colorsRef = useRef<CanvasColors | null>(null);
  const haRef = useRef<{ open: number; high: number; low: number; close: number }[]>([]);
  const [mainRev, setMainRev] = useState(0);
  const [settings, setSettingsState] = useState<ChartSettings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const setSettings = useCallback((s: ChartSettings) => { setSettingsState(s); saveSettings(s); }, []);
  const patchSettings = useCallback((p: Partial<ChartSettings>) => setSettings({ ...settingsRef.current, ...p }), [setSettings]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const typedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vol = useRef<ISeriesApi<"Histogram"> | null>(null);
  const renderer = useRef<IndicatorRenderer | null>(null);
  const drawCtl = useRef<DrawingController | null>(null);
  const bindMain = useRef<(s: ISeriesApi<SeriesType>) => void>(() => undefined);
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const keyRef = useRef<string>("");
  const lastTimeRef = useRef<number>(0);
  const firstTimeRef = useRef<number>(0);
  const seqRef = useRef<number>(-1);
  const needOlder = useRef(onNeedOlder);
  needOlder.current = onNeedOlder;
  const debugRef = useRef(debug); debugRef.current = debug;
  const [hover, setHover] = useState<{ kind: "last" } | { kind: "time"; t: number } | { kind: "none" }>({ kind: "last" });
  const hoverTime = hover.kind === "time" ? hover.t : null;
  const blank = hover.kind === "none";
  const [paneTops, setPaneTops] = useState<number[]>([0]);
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [pickerCat, setPickerCat] = useState<string | undefined>(undefined);
  const pickerSeen = useRef(0);
  useEffect(() => {
    if (!pickerRequest || pickerRequest.seq === pickerSeen.current) return;
    pickerSeen.current = pickerRequest.seq;
    setPickerCat(pickerRequest.category);
    setPicker(true);
  }, [pickerRequest]);
  const [volState, setVolState] = useState<"1" | "0" | "x">(() => { try { const v = localStorage.getItem(VOL_KEY); return v === "0" || v === "x" ? v : "1"; } catch { return "1"; } });
  const volVisible = volState === "1";

  const draw = useDrawings(symbol, storage);
  const drawRef = useRef<DrawingsStore>(draw);
  drawRef.current = draw;
  const [drawEdit, setDrawEdit] = useState<{ id: string; tab: "style" | "text" | "coords"; before: Drawing[] } | null>(null);
  const [drawMenu, setDrawMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [selected, setSelectedState] = useState<string | null>(null);
  const selRef = useRef<string | null>(null);
  const [seriesMenu, setSeriesMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const marks = useRef<{ prim: SelectionMarks; host: ISeriesApi<SeriesType> }[]>([]);
  const hoverSel = useRef<string | null>(null);
  const menuOpen = useRef(false);
  menuOpen.current = !!seriesMenu || !!drawMenu;
  const barsRef = useRef<Bars>({ times: [], open: [], high: [], low: [], close: [], volume: [] });
  const barsFor = useRef<Bar[] | null>(null);
  if (barsFor.current !== candles) {
    const b: Bars = { times: [], open: [], high: [], low: [], close: [], volume: [] };
    for (const c of candles) { b.times.push(c.time); b.open.push(c.open); b.high.push(c.high); b.low.push(c.low); b.close.push(c.close); b.volume.push(c.volume ?? 0); }
    barsRef.current = b;
    barsFor.current = candles;
  }
  useEffect(() => { drawCtl.current?.refresh(); }, [candles]);
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const mainData = useCallback((cs: Bar[]) => {
    const st = settingsRef.current.barStyle, kind = mainKind(st);
    if (st === "heikin") {
      const b = barsRef.current;
      haRef.current = heikinAshi(b.open, b.high, b.low, b.close);
      return haRef.current.map((h, i) => ({ time: Math.floor(cs[i].time / 1000) as UTCTimestamp, ...h }));
    }
    if (st === "highlow") return cs.map(highLow);
    if (kind === "candle" || kind === "bar") return cs.map(toBar);
    if (kind === "columns") return cs.map((c, i) => column(c, cs[i - 1]));
    return cs.map((c) => ({ time: Math.floor(c.time / 1000) as UTCTimestamp, value: c.close }));
  }, []);
  const mainPoint = useCallback((cs: Bar[]) => {
    const st = settingsRef.current.barStyle, kind = mainKind(st), n = cs.length, c = cs[n - 1];
    const time = Math.floor(c.time / 1000) as UTCTimestamp;
    if (st === "heikin") {
      const b = barsRef.current, ha = haRef.current;
      const prev = n >= 2 ? (ha.length >= n ? ha[n - 2] : ha[ha.length - 1]) : undefined;
      const [h] = heikinAshi(b.open, b.high, b.low, b.close, n - 1, prev);
      ha.length = n - 1; ha.push(h);
      return { time, ...h };
    }
    if (st === "highlow") return highLow(c);
    if (kind === "candle" || kind === "bar") return toBar(c);
    if (kind === "columns") return column(c, cs[n - 2]);
    return { time, value: c.close };
  }, []);
  const column = (c: Bar, prev: Bar | undefined) => {
    const s = settingsRef.current;
    return { time: Math.floor(c.time / 1000) as UTCTimestamp, value: c.close, color: c.close >= (prev?.close ?? c.open) ? s.upColor : s.downColor };
  };
  const hlc = useRef<HlcArea | null>(null);
  const syncHlc = useCallback(() => {
    const s = series.current;
    if (!s) return;
    const st = settingsRef.current;
    if (st.barStyle !== "hlcarea") {
      if (hlc.current) { try { s.detachPrimitive(hlc.current); } catch {} hlc.current = null; }
      return;
    }
    const b = barsRef.current;
    const data = { times: b.times, high: b.high, low: b.low, close: b.close, up: st.upColor, down: st.downColor };
    if (hlc.current) hlc.current.set(data);
    else { hlc.current = new HlcArea(data); s.attachPrimitive(hlc.current); }
  }, []);
  const autoscale = useCallback<Autoscale>((original) => {
    const st = settingsRef.current.barStyle;
    if (st !== "columns" && st !== "hlcarea") return original();
    const b = barsRef.current, lo = st === "columns" ? b.close : b.low, hi = st === "columns" ? b.close : b.high;
    const r = chart.current?.timeScale().getVisibleLogicalRange();
    if (!r || !lo.length) return original();
    let min = Infinity, max = -Infinity;
    for (let i = Math.max(0, Math.floor(r.from)); i <= Math.min(lo.length - 1, Math.ceil(r.to)); i++) { min = Math.min(min, lo[i]); max = Math.max(max, hi[i]); }
    return min <= max ? { priceRange: { minValue: min, maxValue: max } } : original();
  }, []);
  const toVolC = useCallback((c: Bar) => {
    const up = c.close >= c.open, s = settingsRef.current;
    return { time: Math.floor(c.time / 1000) as UTCTimestamp, value: c.volume ?? 0, color: alpha(up ? s.upColor : s.downColor, 0.5) };
  }, []);
  const intervalMsRef = useRef(IV_MS[interval] ?? 900e3);
  intervalMsRef.current = IV_MS[interval] ?? 900e3;

  const events = useRef<IndicatorEvents>({});
  const ind = useIndicators(engine, symbol, interval, candles, events, dataSeq);
  const engineRef = useRef(engine); engineRef.current = engine;

  const [feedPrecision, setFeedPrecision] = useState<{ symbol: string; value: number } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.resolve(datafeed.pricePrecision?.(symbol))
      .then((v) => { if (alive) setFeedPrecision(typeof v === "number" && v >= 0 ? { symbol, value: v } : null); })
      .catch(() => { if (alive) setFeedPrecision(null); });
    return () => { alive = false; };
  }, [datafeed, symbol]);
  const fixedPrecision = settings.precision !== "default" ? settings.precision : feedPrecision?.symbol === symbol ? feedPrecision.value : undefined;
  const fixedPrecisionRef = useRef(fixedPrecision); fixedPrecisionRef.current = fixedPrecision;
  const fmtBarPrice = (n: number) => (fixedPrecision === undefined ? fmtPrice(n) : n.toFixed(fixedPrecision));

  const symbolPrecision = useMemo(() => {
    const last = candles[candles.length - 1];
    return fixedPrecision ?? (last ? priceDecimals(last.close) : 6);
  }, [candles.length > 0 ? candles[candles.length - 1].close : "", symbol, fixedPrecision]);

  const dirRef = useRef(new Map<number, boolean>());
  useEffect(() => {
    const m = dirRef.current;
    if (m.size !== candles.length || candles.length < 3) { m.clear(); for (const c of candles) m.set(c.time, c.close >= c.open); }
    else { const c = candles[candles.length - 1]; m.set(c.time, c.close >= c.open); }
  }, [candles]);

  const symbolRef = useRef(symbol), intervalRef = useRef(interval);
  symbolRef.current = symbol; intervalRef.current = interval;
  const latest = useRef({ instances: ind.instances, states: ind.states, strategy: overlayFrame(frame), symbolPrecision });
  latest.current = { instances: ind.instances, states: ind.states, strategy: overlayFrame(frame), symbolPrecision };

  const buildItems = useCallback((): { items: RenderItem[]; paneOf: Map<string, number> } => {
    const { instances, states, strategy, symbolPrecision: sp } = latest.current;
    const items: RenderItem[] = [];
    const paneOf = new Map<string, number>();
    let next = 1;
    for (const inst of instances) {
      const entry = engineRef.current?.entry(inst.libraryId);
      const f = ind.frameFor(inst.id, `${symbolRef.current}:${intervalRef.current}`);
      if (!entry || !f || f.plots.length === 0) continue;
      const cfg = states[inst.id]?.config ?? {};
      const overlay = inst.overlay ?? cfg.overlay ?? entry.overlay;
      const pane = overlay ? 0 : next++;
      paneOf.set(inst.id, pane);
      const prec = precisionFor(cfg, f, overlay, sp);
      const onInterval = !inst.intervals || inst.intervals.includes(intervalRef.current);
      items.push({ id: inst.id, visible: inst.visible && onInterval, frame: f, style: inst.style, priceFormat: priceFormatFor(cfg, prec),
                   paneFor: () => (overlay ? 0 : pane) });
    }
    if (strategy && strategy.plots.length) {
      const base = next - 1;
      items.push({ id: "__strategy", visible: true, frame: strategy, style: {}, priceFormat: { type: "price", precision: sp, minMove: Math.pow(10, -sp) },
                   paneFor: (p) => (p === 0 ? 0 : base + p) });
    }
    return { items, paneOf };
  }, [ind.frameFor]);

  const measurePanes = useCallback(() => {
    const c = chart.current;
    if (!c) return;
    const tops: number[] = [];
    let acc = 0;
    for (const p of c.panes()) { tops.push(acc); acc += p.getHeight() + 1; }
    setPaneTops((old) => (old.length === tops.length && old.every((v, i) => v === tops[i]) ? old : tops));
  }, []);

  const raf = useRef(0);
  const syncAll = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = renderer.current;
      if (!r) return;
      r.sync(buildItems().items);
      requestAnimationFrame(measurePanes);
    });
  }, [buildItems, measurePanes]);

  events.current.onFull = () => syncAll();
  events.current.onTail = (id: string, times: number[]) => {
    const it = buildItems().items.find((x) => x.id === id);
    if (it) renderer.current?.tail(it, times);
  };

  const applyMarks = useCallback(() => {
    for (const m of marks.current) { try { m.host.detachPrimitive(m.prim); } catch {} }
    marks.current = [];
    const sel = selRef.current;
    if (!sel) return;
    const hosts = sel === "__main" ? [series.current] : sel === "__volume" ? [vol.current] : renderer.current?.seriesOf(sel) ?? [];
    for (const host of hosts) {
      if (!host) continue;
      const prim = new SelectionMarks({ period: () => intervalMsRef.current / 1000, background: () => colorsRef.current?.bg ?? "#151b23" });
      host.attachPrimitive(prim);
      marks.current.push({ prim, host: host as ISeriesApi<SeriesType> });
    }
    priceLabels.current?.update();
  }, []);
  const select = useCallback((id: string | null) => {
    if (id && drawRef.current.selRef.current) drawRef.current.select(null);
    if (selRef.current === id) return;
    selRef.current = id;
    setSelectedState(id);
    renderer.current?.setSelected(id);
    applyMarks();
  }, [applyMarks]);
  const selectRef = useRef(select); selectRef.current = select;
  const selectableOf = (api: ISeriesApi<SeriesType> | undefined): string | null => {
    if (!api) return null;
    if (api === series.current) return "__main";
    if (api === vol.current) return "__volume";
    const id = renderer.current?.itemOf(api) ?? null;
    return id === "__strategy" ? null : id;
  };
  const selectableRef = useRef(selectableOf); selectableRef.current = selectableOf;

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        fontFamily: getComputedStyle(el.current).getPropertyValue("--font").trim() || "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
        fontSize: 12,
        panes: { enableResize: true },
      },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
      hoveredSeriesOnTop: false,
    });
    colorsRef.current = canvasColors(el.current);
    c.applyOptions(themeOptions(colorsRef.current));
    mainStyle.current = settingsRef.current.barStyle;
    const s = createMain(c, mainStyle.current, autoscale);
    s.applyOptions(mainOptions(settingsRef.current, 0) as any);
    s.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.26 } });
    const v = c.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", lastValueVisible: false, priceLineVisible: false });
    v.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chart.current = c; series.current = s; vol.current = v;
    const background = () => colorsRef.current?.bg ?? "#151b23";
    renderer.current = new IndicatorRenderer(c, background);
    renderer.current.setFront(() => series.current);
    renderer.current.setAfterBuild(applyMarks);
    renderer.current.setSelected(selRef.current);
    renderer.current.bringToFront();
    bindMain.current = (main: ISeriesApi<SeriesType>) => {
      drawCtl.current?.destroy();
      if (priceLabels.current) { try { series.current?.detachPrimitive(priceLabels.current); } catch {} }
      drawCtl.current = makeController(c, main);
      priceLabels.current = new ValueLabels({
        labels: () => [...mainLabels(main), ...(renderer.current?.labelsFor(0) ?? [])],
        background,
        ticking: true,
      });
      main.attachPrimitive(priceLabels.current);
    };
    type Point = { time: number; open?: number; close?: number; value?: number; color?: string };
    const lastPoint = (main: ISeriesApi<SeriesType>) => main.dataByIndex(Number.MAX_SAFE_INTEGER, MismatchDirection.NearestLeft) as Point | null;
    const visiblePoint = (main: ISeriesApi<SeriesType>) => {
      const r = c.timeScale().getVisibleLogicalRange();
      return r ? main.dataByIndex(Math.floor(r.to), MismatchDirection.NearestLeft) as Point | null : null;
    };
    const viewEnd = () => {
      const main = series.current, last = main && lastPoint(main), at = main && visiblePoint(main);
      return last && at ? { timeMs: at.time * 1000, latest: at.time >= last.time } : null;
    };
    renderer.current.setViewEnd(viewEnd);
    const realBar = (d: Point): Point => {
      const times = barsRef.current.times, t = d.time * 1000;
      let lo = 0, hi = times.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < t) lo = m + 1; else hi = m; }
      return times[lo] === t ? { time: d.time, open: barsRef.current.open[lo], close: barsRef.current.close[lo] } : d;
    };
    const pointLabel = (main: ISeriesApi<SeriesType>, p: Point | null): ValueLabel | null => {
      const st = settingsRef.current, kind = mainKind(st.barStyle), cs = candlesRef.current;
      const d = p && st.barStyle === "highlow" ? realBar(p) : p;
      const v = d?.close ?? d?.value;
      if (!d || v === undefined || !Number.isFinite(v)) return null;
      const y = main.priceToCoordinate(v);
      if (y === null) return null;
      if (kind === "columns" && d.color) return { y, text: main.priceFormatter().format(v), color: d.color };
      const up = kind === "candle" || kind === "bar" ? v >= (d.open ?? v) : kind === "baseline" ? v >= (cs[0]?.close ?? v) : true;
      return { y, text: main.priceFormatter().format(v), color: up ? st.upColor : st.downColor };
    };
    const mainLabels = (main: ISeriesApi<SeriesType>): ValueLabel[] => {
      const last = lastPoint(main), at = visiblePoint(main), out: ValueLabel[] = [];
      const now = pointLabel(main, last);
      if (now) {
        const st = settingsRef.current, cs = candlesRef.current, l = cs[cs.length - 1];
        const sub = st.countdown !== "off" && l && !isClosed(l, true) ? countdownText(l.time + intervalMsRef.current - Date.now(), st.countdown, blockRef.current) : undefined;
        out.push({ ...now, filled: true, fixed: true, sub, mark: selRef.current === "__main" });
      }
      if (last && at && at.time < last.time) { const back = pointLabel(main, at); if (back) out.push({ ...back, mark: selRef.current === "__main" }); }
      return out;
    };
    const makeController = (cc: IChartApi, main: ISeriesApi<SeriesType>) => new DrawingController({
      chart: cc, series: main as ISeriesApi<"Candlestick">, el: el.current!,
      store: () => drawRef.current,
      timeline: () => ({ times: barsRef.current.times, barMs: intervalMsRef.current }),
      bars: () => barsRef.current,
      openSettings: (id) => setDrawEdit({ id, tab: "style", before: drawRef.current.ref.current }),
      openMenu: (id, x, y) => setDrawMenu({ id, x, y }),
      editText: (id) => setDrawEdit({ id, tab: "text", before: drawRef.current.ref.current }),
      volumeUnit: () => volumeUnitRef.current ?? "",
    });
    series.current = s;
    bindMain.current(s);
    renderer.current.setCandleDirection((t) => dirRef.current.get(t));
    const onRange = (r: { from: number; to: number } | null) => {
      if (!r) return;
      const info = series.current?.barsInLogicalRange(r as any);
      if (info && info.barsBefore < 100) needOlder.current?.();
    };
    c.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    const cursorTool = () => drawRef.current.toolRef.current === "cursor";
    const onClick = (p: MouseEventParams<Time>) => {
      if (!cursorTool() || drawRef.current.selRef.current) return;
      selectRef.current(selectableRef.current(p.hoveredSeries as ISeriesApi<SeriesType> | undefined));
    };
    const onDbl = (p: MouseEventParams<Time>) => {
      if (!cursorTool()) return;
      const id = selectableRef.current(p.hoveredSeries as ISeriesApi<SeriesType> | undefined);
      if (id === "__main") setSettingsOpen(true);
      else if (id && id !== "__volume") setEditing(id);
    };
    const host = el.current;
    const onContext = (e: MouseEvent) => {
      const id = hoverSel.current;
      if (!id || id === "__main" || !cursorTool()) return;
      e.preventDefault();
      selectRef.current(id);
      setSeriesMenu({ id, x: e.clientX, y: e.clientY });
    };
    c.subscribeClick(onClick);
    c.subscribeDblClick(onDbl);
    host.addEventListener("contextmenu", onContext);
    const onMove = (p: MouseEventParams<Time>) => {
      const hovered = p.point && cursorTool() ? selectableRef.current(p.hoveredSeries as ISeriesApi<SeriesType> | undefined) : null;
      if (hovered !== hoverSel.current) { hoverSel.current = hovered; host.classList.toggle("series-hover", !!hovered); }
      if (p.time !== undefined) { const t = (p.time as number) * 1000; setHover((h) => (h.kind === "time" && h.t === t ? h : { kind: "time", t })); return; }
      const none = !!p.point && p.logical !== undefined && (p.logical as number) < 0;
      setHover((h) => (none ? (h.kind === "none" ? h : { kind: "none" }) : h.kind === "last" ? h : { kind: "last" }));
    };
    c.subscribeCrosshairMove(onMove);
    const ro = new ResizeObserver(() => requestAnimationFrame(measurePanes));
    ro.observe(el.current);
    syncAll();
    if (debugRef.current ?? isDev()) {
      (window as any).__alphaChart = {
        candles: () => series.current!.data().map((d: any) => d.time as number),
        mainType: () => series.current!.seriesType(),
        settings: () => settingsRef.current,
        visible: () => c.timeScale().getVisibleLogicalRange(),
        drawings: () => drawRef.current.ref.current,
        drawingPx: () => drawRef.current.ref.current.map((d) => d.anchors.map((a) => drawCtl.current?.layer.toPx(a))),
        selectedDrawing: () => drawRef.current.selRef.current,
        selected: () => selRef.current,
        selectionPoints: () => marks.current.map((m) => m.prim.points()),
        measure: () => drawCtl.current?.measureState() ?? null,
        measureLabel: () => drawCtl.current?.layer.lastMeasureLabel ?? null,
        measureAxes: () => drawCtl.current?.layer.axisState() ?? null,
        barTimes: () => barsRef.current.times,
        axisLabels: () => priceLabels.current?.last ?? [],
        pricePrecision: () => (series.current!.options().priceFormat as { precision: number }).precision,
        colors: () => { const o = c.options(); return { grid: o.grid.vertLines.color, text: o.layout.textColor, border: o.rightPriceScale.borderColor }; },
        indicatorSeries: () => c.panes().flatMap((p, pane) => p.getSeries().filter((x) => x !== series.current && x !== v)
          .map((x) => ({ pane, times: x.data().filter((d: any) => d.value !== undefined).map((d: any) => d.time as number) }))),
      };
    }
    return () => {
      ro.disconnect();
      c.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      c.unsubscribeCrosshairMove(onMove);
      c.unsubscribeClick(onClick);
      c.unsubscribeDblClick(onDbl);
      host.removeEventListener("contextmenu", onContext);
      marks.current = [];
      renderer.current?.destroy();
      drawCtl.current?.destroy(); drawCtl.current = null; priceLabels.current = null;
      c.remove();
      chart.current = null; series.current = null; vol.current = null; renderer.current = null; markers.current = null;
      keyRef.current = ""; lastTimeRef.current = 0; firstTimeRef.current = 0;
    };
  }, [measurePanes, syncAll]);

  useEffect(() => {
    const s = series.current, v = vol.current, c = chart.current;
    if (!s || !v || !c) return;
    const key = `${symbol}:${interval}`;
    const last = candles[candles.length - 1];
    if (!last) {
      s.setData([]); v.setData([]);
      renderer.current?.clearData();
      keyRef.current = key; lastTimeRef.current = 0; firstTimeRef.current = 0;
      return;
    }
    const lastTime = Math.floor(last.time / 1000);
    const firstTime = Math.floor(candles[0].time / 1000);
    const fresh = seqRef.current !== dataSeq || keyRef.current !== key || lastTimeRef.current === 0;
    const prepended = !fresh && firstTime < firstTimeRef.current;
    const incremental = !fresh && !prepended && firstTime === firstTimeRef.current && lastTime >= lastTimeRef.current;
    seqRef.current = dataSeq;
    if (fresh) {
      const prec = fixedPrecisionRef.current ?? priceDecimals(last.close);
      s.applyOptions({ priceFormat: { type: "price", precision: prec, minMove: Math.pow(10, -prec) }, ...(mainKind(settingsRef.current.barStyle) === "baseline" ? mainOptions(settingsRef.current, candles[0].close) : {}) } as any);
      renderer.current?.clearData();
      s.setData(mainData(candles) as any);
      v.setData(candles.map(toVolC));
      const n = candles.length;
      if (n > INITIAL_BARS) c.timeScale().setVisibleLogicalRange({ from: n - INITIAL_BARS, to: n - 1 + 4 });
      else c.timeScale().fitContent();
      syncAll();
    } else if (prepended) {
      const added = candles.findIndex((k) => Math.floor(k.time / 1000) >= firstTimeRef.current);
      const range = c.timeScale().getVisibleLogicalRange();
      s.setData(mainData(candles) as any);
      v.setData(candles.map(toVolC));
      if (range && added > 0) c.timeScale().setVisibleLogicalRange({ from: range.from + added, to: range.to + added });
    } else if (incremental) {
      s.update(mainPoint(candles) as any);
      v.update(toVolC(last));
    } else {
      const range = c.timeScale().getVisibleLogicalRange();
      s.setData(mainData(candles) as any);
      v.setData(candles.map(toVolC));
      if (range) c.timeScale().setVisibleLogicalRange(range);
    }
    keyRef.current = key;
    lastTimeRef.current = lastTime;
    firstTimeRef.current = firstTime;
    syncHlc();
  }, [candles, dataSeq, symbol, interval, syncAll, mainData, mainPoint, toVolC]);

  useEffect(() => {
    const c = chart.current, old = series.current, v = vol.current;
    if (!c || !old) return;
    if (mainKind(settings.barStyle) !== mainKind(mainStyle.current)) {
      const range = c.timeScale().getVisibleLogicalRange();
      const fmt = old.options().priceFormat;
      bindMain.current = bindMain.current;
      drawCtl.current?.destroy(); drawCtl.current = null;
      if (priceLabels.current) { try { old.detachPrimitive(priceLabels.current); } catch {} priceLabels.current = null; }
      markers.current = null;
      if (hlc.current) { try { old.detachPrimitive(hlc.current); } catch {} hlc.current = null; }
      c.removeSeries(old);
      const s = createMain(c, settings.barStyle, autoscale);
      s.applyOptions({ priceFormat: fmt } as any);
      s.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.26 } });
      series.current = s;
      renderer.current?.bringToFront();
      mainStyle.current = settings.barStyle;
      bindMain.current(s);
      applyMarks();
      const cs = candlesRef.current;
      if (cs.length) s.setData(mainData(cs) as any);
      if (range) c.timeScale().setVisibleLogicalRange(range);
      setMainRev((r) => r + 1);
    } else if (settings.barStyle !== mainStyle.current || mainKind(settings.barStyle) === "columns") {
      mainStyle.current = settings.barStyle;
      const cs = candlesRef.current;
      if (cs.length) old.setData(mainData(cs) as any);
    }
    syncHlc();
    const cs = candlesRef.current;
    series.current!.applyOptions(mainOptions(settings, cs.length ? cs[0].close : 0) as any);
    if (cs.length && v) v.setData(cs.map(toVolC));
    c.applyOptions({ grid: { vertLines: { visible: settings.grid }, horzLines: { visible: settings.grid } } });
    drawCtl.current?.refresh();
  }, [settings.barStyle, settings.upColor, settings.downColor, settings.wicks, settings.borders, settings.lastPriceLine, settings.grid, mainData, toVolC]);

  useEffect(() => {
    if (!el.current || !chart.current) return;
    colorsRef.current = canvasColors(el.current);
    chart.current.applyOptions(themeOptions(colorsRef.current));
    drawCtl.current?.refresh();
  }, [resolvedTheme, documentTheme]);

  useEffect(() => {
    const s = series.current, cs = candlesRef.current;
    if (!s || !cs.length) return;
    const prec = fixedPrecision ?? priceDecimals(cs[cs.length - 1].close);
    s.applyOptions({ priceFormat: { type: "price", precision: prec, minMove: Math.pow(10, -prec) } });
  }, [fixedPrecision, mainRev]);

  useEffect(() => {
    const mode = { normal: PriceScaleMode.Normal, log: PriceScaleMode.Logarithmic, percent: PriceScaleMode.Percentage, indexed: PriceScaleMode.IndexedTo100 }[settings.scaleMode];
    series.current?.priceScale().applyOptions({ mode, invertScale: settings.invert, autoScale: settings.autoScale });
  }, [settings.scaleMode, settings.invert, settings.autoScale, mainRev]);

  useEffect(() => {
    const tz = settings.timezone;
    setLabelZone(tz);
    chart.current?.applyOptions({
      localization: { timeFormatter: (t: number) => formatTime(t * 1000, tz) },
      timeScale: { tickMarkFormatter: (t: number, type: number) => formatTick(t * 1000, type, tz) },
    } as any);
    drawCtl.current?.refresh();
  }, [settings.timezone]);

  const appliedView = useRef(-1);
  useEffect(() => {
    const c = chart.current, req = viewRequest;
    if (!c || !req || appliedView.current === req.seq || candles.length === 0) return;
    appliedView.current = req.seq;
    const ts = c.timeScale(), times = barsRef.current.times;
    const idx = (ms: number) => { let lo = 0, hi = times.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < ms) lo = m + 1; else hi = m; } return lo; };
    if (req.center !== undefined) {
      const r = ts.getVisibleLogicalRange(), half = r ? (r.to - r.from) / 2 : INITIAL_BARS / 2;
      const i = idx(req.center);
      ts.setVisibleLogicalRange({ from: i - half, to: i + half });
    } else if (req.from !== undefined) {
      const from = idx(req.from), to = req.to !== undefined ? idx(req.to) : times.length - 1;
      ts.setVisibleLogicalRange({ from, to: Math.max(from + 5, to) + 4 });
    }
  }, [viewRequest, candles]);

  useEffect(() => {
    vol.current?.applyOptions({ visible: volVisible });
    try { localStorage.setItem(VOL_KEY, volState); } catch {}
  }, [volState, volVisible]);

  useEffect(() => { syncAll(); }, [ind.instances, ind.states, frame, symbolPrecision, interval, syncAll]);

  useEffect(() => {
    const cs = series.current;
    if (!cs) return;
    const mk: SeriesMarker<Time>[] = [];
    const shape = (sh: { time: number; shape: string; location: string; color: string; text?: string }) =>
      mk.push({ time: Math.floor(sh.time / 1000) as UTCTimestamp, position: sh.location === "aboveBar" ? "aboveBar" : "belowBar", shape: SHAPES[sh.shape] ?? "circle", color: sh.color, text: sh.text });
    for (const sh of frame?.shapes ?? []) shape(sh);
    for (const inst of ind.instances) if (inst.visible) for (const sh of ind.frameFor(inst.id, `${symbol}:${interval}`)?.shapes ?? []) shape(sh);
    mk.sort((a, b) => (a.time as number) - (b.time as number));
    if (!markers.current) markers.current = createSeriesMarkers(cs, mk); else markers.current.setMarkers(mk);
  }, [frame, ind.instances, ind.rev, ind.frameFor, symbol, interval, mainRev]);

  useEffect(() => { drawCtl.current?.refresh(); }, [draw.items, draw.selected, draw.prefs, draw.tool]);
  useEffect(() => {
    const lines = draw.prefs.cursor === "cross";
    chart.current?.applyOptions({ crosshair: { vertLine: { visible: lines }, horzLine: { visible: lines } } });
  }, [draw.prefs.cursor]);
  const [indHidden, setIndHidden] = useState(false);
  const shownBefore = useRef<Set<string>>(new Set());
  const hideIndicators = useCallback((hide: boolean) => {
    if (hide) {
      shownBefore.current = new Set(ind.instances.filter((i) => i.visible).map((i) => i.id));
      for (const id of shownBefore.current) ind.update(id, { visible: false });
    } else {
      for (const id of shownBefore.current) if (ind.instances.some((i) => i.id === id)) ind.update(id, { visible: true });
      shownBefore.current = new Set();
    }
    setIndHidden(hide);
  }, [ind]);
  useEffect(() => { if (indHidden && ind.instances.some((i) => i.visible)) { setIndHidden(false); shownBefore.current = new Set(); } }, [ind.instances, indHidden]);
  useEffect(() => { if (draw.selected && selRef.current) select(null); }, [draw.selected, select]);
  useEffect(() => {
    const sel = selRef.current;
    if (!sel || sel === "__main") return;
    if (sel === "__volume" ? !volVisible : !ind.instances.some((i) => i.id === sel && i.visible)) select(null);
  }, [ind.instances, volVisible, select]);
  const removeSelected = useRef<() => boolean>(() => false);
  removeSelected.current = () => {
    const sel = selRef.current;
    if (!sel || sel === "__main") return false;
    if (sel === "__volume") setVolState("x"); else ind.remove(sel);
    select(null);
    return true;
  };

  const typedRef = useRef("");
  const onIntervalRef = useRef(onInterval); onIntervalRef.current = onInterval;
  const intervalsRef = useRef(intervals); intervalsRef.current = intervals;
  const resetView = useCallback(() => {
    const c = chart.current, n = candlesRef.current.length;
    if (!c) return;
    if (n > INITIAL_BARS) c.timeScale().setVisibleLogicalRange({ from: n - INITIAL_BARS, to: n - 1 + 4 }); else c.timeScale().fitContent();
    patchSettings({ autoScale: true });
  }, [patchSettings]);

  const layoutDoc: LayoutDoc = useMemo(() => ({
    schemaVersion: 1, interval, settings, volume: volState,
    indicators: ind.instances.map(({ id: _id, ...rest }) => rest),
  }), [interval, settings, volState, ind.instances]);
  useLayout(storage, layoutDoc, (doc) => {
    if (doc.settings) setSettings(normalizeSettings(doc.settings));
    if (Array.isArray(doc.indicators)) ind.replaceAll(doc.indicators.map((i) => ({ ...i, id: "" })));
    if (doc.volume === "0" || doc.volume === "1" || doc.volume === "x") setVolState(doc.volume);
    if (doc.interval && doc.interval !== interval) onIntervalRef.current?.(doc.interval);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable || t.closest(".cm-editor"))) return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setPicker(true); return; }
      if (selRef.current && !typedRef.current && !t?.closest(".modal") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "Escape") { if (!menuOpen.current) selectRef.current(null); return; }
        if ((e.key === "Delete" || e.key === "Backspace") && removeSelected.current()) { e.preventDefault(); return; }
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        const st = settingsRef.current;
        if (k === "l") { e.preventDefault(); patchSettings({ scaleMode: st.scaleMode === "log" ? "normal" : "log" }); }
        else if (k === "i") { e.preventDefault(); patchSettings({ invert: !st.invert }); }
        else if (k === "r") { e.preventDefault(); resetView(); }
        else if (k === "g") { e.preventDefault(); setGotoOpen(true); }
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      const ch = e.key;
      const buf = typedRef.current;
      if (/^[0-9]$/.test(ch) || (buf && /^[mhdwMHDW]$/.test(ch))) {
        e.preventDefault();
        const next = (buf + ch).slice(0, 6);
        typedRef.current = next; setTyped(next);
        if (typedTimer.current) clearTimeout(typedTimer.current);
        typedTimer.current = setTimeout(() => { typedRef.current = ""; setTyped(""); }, 3000);
      } else if (buf && ch === "Enter") {
        e.preventDefault();
        const iv = parseInterval(buf);
        typedRef.current = ""; setTyped("");
        if (iv && (!intervalsRef.current || intervalsRef.current.includes(iv))) onIntervalRef.current?.(iv);
      } else if (buf && (ch === "Escape" || ch === "Backspace")) {
        e.preventDefault();
        const next = ch === "Backspace" ? buf.slice(0, -1) : "";
        typedRef.current = next; setTyped(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { paneOf } = useMemo(() => buildItems(), [buildItems, ind.instances, ind.states, ind.rev, frame, symbolPrecision]);
  const candleAt = useMemo(() => {
    if (hoverTime === null) return candles[candles.length - 1];
    let lo = 0, hi = candles.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (candles[m].time === hoverTime) return candles[m]; if (candles[m].time < hoverTime) lo = m + 1; else hi = m - 1; }
    return candles[candles.length - 1];
  }, [hoverTime, candles]);

  const rows = ind.instances.map((inst, k) => {
    const entry: StudyEntry = engine?.entry(inst.libraryId) ?? { id: inst.libraryId, name: "Loading…", shortTitle: engine?.accepts?.(inst.libraryId) ? "Script" : inst.libraryId,
                                                               overlay: true, category: "", description: "" };
    const st = ind.states[inst.id];
    const f = ind.frameFor(inst.id, `${symbol}:${interval}`);
    const cfg = st?.config ?? {};
    const overlay = inst.overlay ?? cfg.overlay ?? entry.overlay;
    const prec = precisionFor(cfg, f, overlay, symbolPrecision);
    const values: RowValue[] = [];
    for (const p of f?.plots ?? []) {
      if (p.display === "pane" || p.display === "none" || inst.style[p.title]?.visible === false) continue;
      const i = blank ? -1 : indexAt(p.times, hoverTime);
      const v = i >= 0 ? p.values[i] : NaN;
      values.push({ text: formatValue(v, cfg, prec), color: i >= 0 ? plotColorAt(p, i, inst.style[p.title], (t) => dirRef.current.get(t)) : p.color });
    }
    const { name: title, args } = legendTitle(entry, inst, st);
    return { inst, k, title, args, values, overlay, pane: paneOf.get(inst.id) ?? (overlay ? 0 : -1), error: st?.error ?? null };
  });

  const rowProps = (r: (typeof rows)[number]) => ({
    name: r.title, args: settings.status.indicatorArgs ? r.args : "", values: settings.status.indicatorValues ? r.values : [], visible: r.inst.visible, error: r.error, overlay: r.overlay,
    onInterval: !r.inst.intervals || r.inst.intervals.includes(interval),
    loading: !r.error && (ind.pending.has(r.inst.id) || !ind.hasFrameFor(r.inst.id, `${symbol}:${interval}`)),
    dragId: r.inst.id, onDropOn: (dragged: string) => ind.reorder(dragged, r.inst.id),
    canMoveUp: r.k > 0, canMoveDown: r.k < ind.instances.length - 1,
    onToggle: () => ind.update(r.inst.id, { visible: !r.inst.visible }),
    onSettings: () => setEditing(r.inst.id),
    onRemove: () => ind.remove(r.inst.id),
    onDuplicate: () => ind.duplicate(r.inst.id),
    onMovePane: () => ind.update(r.inst.id, { overlay: !r.overlay }),
    onMove: (d: -1 | 1) => ind.move(r.inst.id, d),
    onReset: () => ind.update(r.inst.id, { inputs: {}, style: {}, overlay: null }),
    onSource: onIndicatorSource ? () => onIndicatorSource(r.inst.libraryId) : undefined,
    selected: selected === r.inst.id,
    onSelect: () => select(r.inst.id),
  });

  const show = blank ? undefined : candleAt;
  const none = "∅";
  const chg = show ? show.close - show.open : 0;
  const barColor = !show ? "var(--muted)" : chg >= 0 ? settings.upColor : settings.downColor;
  const chgPct = show && show.open > 0 ? (chg / show.open) * 100 : 0;
  const showClosed = show ? isClosed(show, show === candles[candles.length - 1]) : false;
  const editingInst = editing ? ind.instances.find((i) => i.id === editing) : undefined;
  const mainRows = rows.filter((r) => r.pane === 0 || r.pane === -1);

  return (
    <div className="alpha-chart" data-theme={resolvedTheme} style={{ display: "contents" }}>
      <div className="chart-tools">
        {toolbar}
        <span className="tool-sep" />
        <ChartTypeMenu value={settings.barStyle} onChange={(barStyle) => patchSettings({ barStyle })} />
        {engine && <button className="btn tool" onClick={() => setPicker(true)} title="Indicators (/)"><IndicatorsIcon />Indicators</button>}
        {engine && storage.templates && <TemplatesMenu store={storage.templates} instances={ind.instances} onApply={(list: IndicatorInstance[]) => ind.replaceAll(list)} />}
        <span className="tool-sep" />
        <button className="btn tool icon" onClick={() => { draw.undo(); drawCtl.current?.refresh(); }} disabled={!draw.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><UndoIcon /></button>
        <button className="btn tool icon" onClick={() => { draw.redo(); drawCtl.current?.refresh(); }} disabled={!draw.canRedo} title="Redo (Ctrl+Y)" aria-label="Redo"><RedoIcon /></button>
        <div className="spacer" />
        {actions}
      </div>
      <div className="chart-body">
      <Toolbar store={draw} count={draw.items.length} onTool={() => drawCtl.current?.toolChanged()}
               indicators={engine ? { count: ind.instances.length, hidden: indHidden, onHide: hideIndicators, onRemove: () => { ind.replaceAll([]); setIndHidden(false); } } : undefined}
               onZoomOut={() => {
                 const ts = chart.current?.timeScale(), r = ts?.getVisibleLogicalRange();
                 if (ts && r) { const mid = (r.from + r.to) / 2, half = (r.to - r.from); ts.setVisibleLogicalRange({ from: mid - half, to: mid + half }); }
               }} />
      <div className="chart-main">
      <div className="chart-wrap" ref={wrap} onPointerUp={() => requestAnimationFrame(measurePanes)}>
        <div ref={el} style={{ position: "absolute", inset: 0 }} />
        <FavoritesBar store={draw} onTool={() => drawCtl.current?.toolChanged()} />
        {(show || blank || fetching) && (
          <div className="legend-stack" style={{ top: 4 }}>
            <div className="legend">
              <span className="sym">{symbol} · {IV_LABEL[interval] ?? interval}{name ? ` · ${name}` : ""}</span>
              {settings.status.ohlc && (
                <>
                  <span>O<b style={{ color: barColor }}>{show ? fmtBarPrice(show.open) : none}</b></span>
                  <span>H<b style={{ color: barColor }}>{show ? fmtBarPrice(show.high) : none}</b></span>
                  <span>L<b style={{ color: barColor }}>{show ? fmtBarPrice(show.low) : none}</b></span>
                  <span>C<b style={{ color: barColor }}>{show ? fmtBarPrice(show.close) : none}</b></span>
                </>
              )}
              {settings.status.change && (show
                ? <span style={{ color: barColor }}>{chg >= 0 ? "+" : ""}{fmtBarPrice(chg)} ({chg >= 0 ? "+" : ""}{chgPct.toFixed(2)}%)</span>
                : <span className="muted">{none} ({none}%)</span>)}
              {show && <span className={`badge ${show.final ? "final" : showClosed ? "" : "open"}`}>{show.final ? "final" : showClosed ? "closed" : "open"}</span>}
              {show && barInfo && settings.status.blocks && barInfo(show)}
              {fetching && <LoadingDots />}
            </div>
            {!collapsed && (
              <>
                {volState !== "x" && (
                  <div className={`ind-row ${volVisible ? "" : "hidden"} ${selected === "__volume" ? "selected" : ""}`}>
                    <span className="ind-title" onClick={() => volVisible && select("__volume")}>Vol{volumeUnit && <> <span className="ind-args">{volumeUnit}</span></>}</span>
                    {volVisible && settings.status.volume && (show
                      ? <span className="ind-val" style={{ color: show.close >= show.open ? settings.upColor : settings.downColor }}>{fmtNum(show.volume ?? NaN, 2)}</span>
                      : <span className="ind-val muted">{none}</span>)}
                    <span className="ind-ctl">
                      <button title={volVisible ? "Hide" : "Show"} aria-label={volVisible ? "Hide" : "Show"} onClick={() => setVolState(volVisible ? "0" : "1")}>{volVisible ? <LegendIcons.eye /> : <LegendIcons.eyeOff />}</button>
                      <button title="Remove" aria-label="Remove" onClick={() => setVolState("x")}><LegendIcons.remove /></button>
                    </span>
                  </div>
                )}
                {mainRows.map((r) => <IndicatorRow key={r.inst.id} {...rowProps(r)} />)}
                {legendRows}
              </>
            )}
            {(mainRows.length > 0 || !!legendRows) && (
              <button className="legend-collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Show indicator legend" : "Hide indicator legend"} aria-label={collapsed ? "Show indicator legend" : "Hide indicator legend"}><Chevron up={!collapsed} /></button>
            )}
          </div>
        )}
        {rows.filter((r) => r.pane > 0).map((r) => (
          <div key={r.inst.id} className="legend-stack" style={{ top: (paneTops[r.pane] ?? 0) + 4 }}>
            <IndicatorRow {...rowProps(r)} />
          </div>
        ))}
        {typed && (
          <div className="typed-interval" role="status">
            <span>{typed}</span>
            <small>{parseInterval(typed) && (!intervals || intervals.includes(parseInterval(typed)!)) ? `Enter: ${IV_LABEL[parseInterval(typed)!] ?? typed}` : "interval not available"}</small>
          </div>
        )}
        {loading && candles.length === 0 && <div className="overlay">Loading candles…</div>}
        {!loading && candles.length === 0 && <div className="overlay">No bars yet for {symbol}</div>}
      </div>
      <BottomBar settings={settings} onSettings={patchSettings} onRange={feed.showRange} onGoTo={() => setGotoOpen(true)}
                 onOpenSettings={() => setSettingsOpen(true)} onReset={resetView} />
      </div>
      </div>
      {settingsOpen && <ChartSettingsDialog settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} block={block}
                                            barInfoLabel={barInfo ? barInfoLabel ?? "Bar details" : undefined}
                                            theme={onThemeChange ? theme ?? "system" : undefined} onThemeChange={onThemeChange} />}
      {gotoOpen && <GoToDate onGo={feed.goTo} onClose={() => setGotoOpen(false)} />}
      {picker && <IndicatorPicker engine={engine} onAdd={(id) => (id === "__volume" ? setVolState("1") : ind.add(id))} onClose={() => { setPicker(false); setPickerCat(undefined); }}
                                  onAddStrategy={onAddStrategy} initialCategory={pickerCat}
                                  count={ind.instances.length} max={ind.max} volumeOnChart={volState !== "x"} />}
      {seriesMenu && (() => {
        const close = () => setSeriesMenu(null);
        if (seriesMenu.id === "__volume") {
          return (
            <ContextMenu x={seriesMenu.x} y={seriesMenu.y} onClose={close}>
              {(act) => <>
                <button onClick={act(() => setVolState("0"))}>Hide</button>
                <hr />
                <button className="danger" onClick={act(() => setVolState("x"))}>Remove</button>
              </>}
            </ContextMenu>
          );
        }
        const r = rows.find((x) => x.inst.id === seriesMenu.id);
        if (!r) return null;
        return <ContextMenu x={seriesMenu.x} y={seriesMenu.y} onClose={close}>{(act) => <IndicatorMenuItems p={rowProps(r)} act={act} />}</ContextMenu>;
      })()}
      {drawMenu && (() => {
        const d = draw.items.find((x) => x.id === drawMenu.id);
        if (!d) return null;
        return (
          <DrawingMenu drawing={d} x={drawMenu.x} y={drawMenu.y} onClose={() => setDrawMenu(null)}
            onSettings={() => setDrawEdit({ id: d.id, tab: d.type === "text" ? "text" : "style", before: draw.ref.current })}
            onClone={() => { const before = draw.ref.current; const copy = { ...structuredClone(d), id: uid() }; draw.setItems([...before, copy], before); draw.select(copy.id); }}
            onLock={() => draw.update(d.id, { locked: !d.locked })}
            onHide={() => { draw.update(d.id, { hidden: true }); draw.select(null); }}
            onFront={() => draw.reorderZ(d.id, "front")} onBack={() => draw.reorderZ(d.id, "back")}
            onRemove={() => draw.remove(d.id)} />
        );
      })()}
      {drawEdit && (() => {
        const d = draw.items.find((x) => x.id === drawEdit.id);
        if (!d) return null;
        return (
          <DrawingSettings drawing={d} initialTab={drawEdit.tab}
            formatPrice={(p) => series.current?.priceFormatter().format(p) ?? String(p)}
            onChange={(patch) => draw.update(d.id, patch, false)}
            onDone={(changed) => { if (changed) draw.setItems(draw.ref.current, drawEdit.before); setDrawEdit(null); }}
            onCancel={(original) => { draw.update(d.id, original, false); setDrawEdit(null); }} />
        );
      })()}
      {editingInst && (
        <SettingsDialog instance={editingInst} state={ind.states[editingInst.id]} frame={ind.frameFor(editingInst.id, `${symbol}:${interval}`)}
                        title={engine?.entry(editingInst.libraryId)?.name ?? "Indicator"}
                        onChange={(patch) => ind.update(editingInst.id, patch)} onClose={() => setEditing(null)} />
      )}
    </div>
  );
});

export default AlphaChart;
