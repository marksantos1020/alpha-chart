export type BarStyle = "bars" | "candles" | "hollow" | "line" | "linemarkers" | "step" | "area" | "hlcarea" | "baseline" | "columns" | "highlow" | "heikin";
export type ScaleMode = "normal" | "log" | "percent" | "indexed";

export interface ChartSettings {
  barStyle: BarStyle;
  upColor: string;
  downColor: string;
  wicks: boolean;
  borders: boolean;
  lastPriceLine: boolean;
  scaleMode: ScaleMode;
  invert: boolean;
  autoScale: boolean;
  timezone: string;
  grid: boolean;
  status: { ohlc: boolean; change: boolean; volume: boolean; blocks: boolean; indicatorArgs: boolean; indicatorValues: boolean };
  countdown: "off" | "time" | "blocks";
  precision: "default" | number;
}

export const DEFAULT_SETTINGS: ChartSettings = {
  barStyle: "candles", upColor: "#089981", downColor: "#F23645", wicks: true, borders: false, lastPriceLine: true,
  scaleMode: "normal", invert: false, autoScale: true, timezone: "UTC", grid: true,
  status: { ohlc: true, change: true, volume: true, blocks: true, indicatorArgs: true, indicatorValues: true },
  countdown: "time",
  precision: "default",
};

const KEY = "alpha.chart.settings.v1";

export const MAX_PRECISION = 8;
export const PRECISIONS: ["default" | number, string][] = [
  ["default", "Default"], ...Array.from({ length: MAX_PRECISION + 1 }, (_, d): [number, string] => [d, d === 0 ? "1" : `0.${"0".repeat(d - 1)}1`]),
];

const OLD_DEFAULT_COLORS = ["#2bb889", "#e35c70"];

export function normalizeSettings(raw: Partial<ChartSettings> | null | undefined): ChartSettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}), status: { ...DEFAULT_SETTINGS.status, ...(raw?.status ?? {}) } };
  if (s.upColor.toLowerCase() === OLD_DEFAULT_COLORS[0] && s.downColor.toLowerCase() === OLD_DEFAULT_COLORS[1]) {
    s.upColor = DEFAULT_SETTINGS.upColor; s.downColor = DEFAULT_SETTINGS.downColor;
  }
  if (!BAR_STYLES.some(([k]) => k === s.barStyle)) s.barStyle = DEFAULT_SETTINGS.barStyle;
  if (s.precision !== "default" && !(Number.isInteger(s.precision) && s.precision >= 0 && s.precision <= MAX_PRECISION)) s.precision = "default";
  return s;
}

export function loadSettings(): ChartSettings {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(KEY) ?? "{}")); } catch { return DEFAULT_SETTINGS; }
}
export function saveSettings(s: ChartSettings) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

export const BAR_STYLE_GROUPS: [BarStyle, string][][] = [
  [["bars", "Bars"], ["candles", "Candles"], ["hollow", "Hollow candles"]],
  [["line", "Line"], ["linemarkers", "Line with markers"], ["step", "Step line"]],
  [["area", "Area"], ["hlcarea", "HLC area"], ["baseline", "Baseline"]],
  [["columns", "Columns"], ["highlow", "High-low"]],
  [["heikin", "Heikin Ashi"]],
];
export const BAR_STYLES: [BarStyle, string][] = BAR_STYLE_GROUPS.flat();

export const TIMEZONES: [string, string][] = [
  ["UTC", "UTC"], ["local", "Browser time zone"], ["America/New_York", "New York"], ["America/Chicago", "Chicago"],
  ["America/Los_Angeles", "Los Angeles"], ["Europe/London", "London"], ["Europe/Berlin", "Berlin"], ["Europe/Moscow", "Moscow"],
  ["Asia/Dubai", "Dubai"], ["Asia/Kolkata", "Kolkata"], ["Asia/Singapore", "Singapore"], ["Asia/Shanghai", "Shanghai"],
  ["Asia/Hong_Kong", "Hong Kong"], ["Asia/Seoul", "Seoul"], ["Asia/Tokyo", "Tokyo"], ["Australia/Sydney", "Sydney"],
];

export function zoneOf(tz: string): string | undefined { return tz === "local" ? undefined : tz; }

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = tz + JSON.stringify(opts);
  let f = fmtCache.get(k);
  if (!f) { f = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: zoneOf(tz), hourCycle: "h23" }); fmtCache.set(k, f); }
  return f;
}
function parts(ms: number, tz: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of fmt(tz, { year: "2-digit", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }).formatToParts(ms)) out[p.type] = p.value;
  return out;
}

export function formatTime(ms: number, tz: string): string {
  const p = parts(ms, tz);
  return `${p.weekday} ${p.day} ${p.month} '${p.year} ${p.hour}:${p.minute}`;
}

export function formatTick(ms: number, type: number, tz: string): string {
  const p = parts(ms, tz);
  switch (type) {
    case 0: return `20${p.year}`;
    case 1: return p.month;
    case 2: return p.day.replace(/^0/, "");
    case 4: return `${p.hour}:${p.minute}:${p.second}`;
    default: return `${p.hour}:${p.minute}`;
  }
}

export function clock(ms: number, tz: string): string {
  const p = parts(ms, tz);
  const name = tz === "UTC" ? "UTC" : tz === "local" ? (Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop() ?? "local") : tz.split("/").pop()!.replace("_", " ");
  return `${p.hour}:${p.minute}:${p.second} ${name}`;
}

export function heikinAshi(o: number[], h: number[], l: number[], c: number[], from = 0, prev?: { open: number; close: number }) {
  const out: { open: number; high: number; low: number; close: number }[] = [];
  let po = prev?.open, pc = prev?.close;
  for (let i = from; i < c.length; i++) {
    const close = (o[i] + h[i] + l[i] + c[i]) / 4;
    const open = po === undefined || pc === undefined ? (o[i] + c[i]) / 2 : (po + pc) / 2;
    out.push({ open, high: Math.max(h[i], open, close), low: Math.min(l[i], open, close), close });
    po = open; pc = close;
  }
  return out;
}
