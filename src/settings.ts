export type BarStyle = "candles" | "hollow" | "bars" | "line" | "area" | "baseline" | "heikin";
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
  /** `blocks` switches the host's bar details (AlphaChart `barInfo`); the name is kept for saved layouts. */
  status: { ohlc: boolean; change: boolean; volume: boolean; blocks: boolean; indicatorArgs: boolean; indicatorValues: boolean };
  countdown: "off" | "time" | "blocks";
}

export const DEFAULT_SETTINGS: ChartSettings = {
  barStyle: "candles", upColor: "#2bb889", downColor: "#e35c70", wicks: true, borders: false, lastPriceLine: true,
  scaleMode: "normal", invert: false, autoScale: true, timezone: "UTC", grid: true,
  status: { ohlc: true, change: true, volume: true, blocks: true, indicatorArgs: true, indicatorValues: true },
  countdown: "time",
};

const KEY = "alpha.chart.settings.v1";

export function loadSettings(): ChartSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...DEFAULT_SETTINGS, ...raw, status: { ...DEFAULT_SETTINGS.status, ...(raw.status ?? {}) } };
  } catch { return DEFAULT_SETTINGS; }
}
export function saveSettings(s: ChartSettings) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

export const BAR_STYLES: [BarStyle, string][] = [
  ["candles", "Candles"], ["hollow", "Hollow candles"], ["bars", "Bars"], ["heikin", "Heikin Ashi"],
  ["line", "Line"], ["area", "Area"], ["baseline", "Baseline"],
];

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
