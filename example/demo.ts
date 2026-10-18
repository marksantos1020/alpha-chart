// Demo implementations of the three host interfaces: a random-walk Datafeed and a small
// IndicatorEngine computed on the main thread. Storage uses the built-in localChartStorage().
import type { Bar, Datafeed, EngineOut, IndicatorEngine, IndicatorFrame, InputDef, StudyEntry } from "../src";

const IV_MS: Record<string, number> = { "1": 60e3, "5": 300e3, "15": 900e3, "60": 3600e3, "240": 14400e3, D: 86400e3 };
const HISTORY = 5000;

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}

const series = new Map<string, Bar[]>();

function history(symbol: string, interval: string): Bar[] {
  const key = `${symbol}:${interval}`;
  let bars = series.get(key);
  if (bars) return bars;
  const ms = IV_MS[interval] ?? 60e3;
  const rand = rng([...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  const last = Math.floor(Date.now() / ms) * ms;
  let price = 100;
  bars = [];
  for (let i = HISTORY - 1; i >= 0; i--) {
    const open = price, vol = 0.004 * Math.sqrt(ms / 60e3);
    const close = Math.max(1, open * (1 + (rand() - 0.5) * 2 * vol));
    const high = Math.max(open, close) * (1 + rand() * vol), low = Math.min(open, close) * (1 - rand() * vol);
    bars.push({ time: last - i * ms, open, high, low, close, volume: 100 + rand() * 900, closed: i > 0 });
    price = close;
  }
  series.set(key, bars);
  return bars;
}

/** Random walk per symbol and interval; the last bar moves every second, a new one opens on time. */
export const demoDatafeed: Datafeed = {
  async getBars(symbol, interval, { limit, end }) {
    const bars = history(symbol, interval);
    let hi = bars.length;
    if (end !== undefined) { hi = 0; while (hi < bars.length && bars[hi].time <= end) hi++; }
    return bars.slice(Math.max(0, hi - limit), hi);
  },
  subscribeBars(symbol, interval, onBars) {
    const ms = IV_MS[interval] ?? 60e3, rand = rng(Date.now() >>> 0);
    const timer = setInterval(() => {
      const bars = history(symbol, interval), last = bars[bars.length - 1];
      if (Date.now() >= last.time + ms) {
        bars[bars.length - 1] = { ...last, closed: true };
        bars.push({ time: last.time + ms, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0, closed: false });
      } else {
        const close = last.close * (1 + (rand() - 0.5) * 0.002);
        bars[bars.length - 1] = { ...last, close, high: Math.max(last.high, close), low: Math.min(last.low, close), volume: (last.volume ?? 0) + rand() * 20 };
      }
      onBars(bars.slice(-2));
    }, 1000);
    return () => clearInterval(timer);
  },
  historyStart: (symbol) => history(symbol, "D")[0]?.time,
};

// ---------------------------------------------------------------- indicators

type Calc = (closes: number[], p: Record<string, number>) => number[];

const sma: Calc = (c, { length }) => c.map((_, i) => (i + 1 < length ? NaN : c.slice(i + 1 - length, i + 1).reduce((a, b) => a + b, 0) / length));
const ema: Calc = (c, { length }) => {
  const k = 2 / (length + 1), out: number[] = [];
  c.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out.map((v, i) => (i + 1 < length ? NaN : v));
};
const rsi: Calc = (c, { length }) => {
  let up = 0, down = 0;
  return c.map((v, i) => {
    if (i === 0) return NaN;
    const d = v - c[i - 1], a = 1 / length;
    up = i === 1 ? Math.max(d, 0) : up * (1 - a) + Math.max(d, 0) * a;
    down = i === 1 ? Math.max(-d, 0) : down * (1 - a) + Math.max(-d, 0) * a;
    return i < length ? NaN : down === 0 ? 100 : 100 - 100 / (1 + up / down);
  });
};

interface Study extends StudyEntry { calc: Calc; inputs: InputDef[]; color: string; levels?: number[] }
const length = (n: number): InputDef[] => [{ name: "length", type: "int", default: n, min: 1, max: 500 }];
const STUDIES: Study[] = [
  { id: "sma", name: "Simple moving average", shortTitle: "SMA", overlay: true, category: "Moving averages", description: "Mean of the last N closes", calc: sma, inputs: length(20), color: "#f2b544" },
  { id: "ema", name: "Exponential moving average", shortTitle: "EMA", overlay: true, category: "Moving averages", description: "Exponentially weighted mean", calc: ema, inputs: length(9), color: "#2962ff" },
  { id: "rsi", name: "Relative strength index", shortTitle: "RSI", overlay: false, category: "Oscillators", description: "Wilder's RSI with 70/30 levels", calc: rsi, inputs: length(14), color: "#7e57c2", levels: [70, 30] },
];

function frameOf(s: Study, bars: Bar[], params: Record<string, unknown>): IndicatorFrame {
  const p: Record<string, number> = {};
  for (const d of s.inputs) p[d.name] = Number(params[d.name] ?? d.default);
  return {
    plots: [{ title: s.shortTitle, pane: s.overlay ? 0 : 1, style: "line", color: s.color, width: 2, lineStyle: "solid", display: "all",
              times: Float64Array.from(bars, (b) => b.time), values: Float64Array.from(s.calc(bars.map((b) => b.close), p)) }],
    bands: [], shapes: [], bgcolors: [],
    hlines: (s.levels ?? []).map((value) => ({ value, color: "#5c6878", style: "dashed" })),
  };
}

/** Three studies computed on the main thread. A real engine would usually run in a Web Worker. */
export const demoEngine: IndicatorEngine = {
  categories: ["Moving averages", "Oscillators", "Volume"],
  entries: () => STUDIES,
  entry: (id) => STUDIES.find((s) => s.id === id),
  connect(onMessage) {
    const insts = new Map<string, { study: Study; params: Record<string, unknown> }>();
    let key = "", bars: Bar[] = [];
    const send = (m: EngineOut) => setTimeout(() => onMessage(m), 0);
    const run = (id: string) => {
      const it = insts.get(id);
      if (it && bars.length) send({ type: "frame", id, key, full: true, frame: frameOf(it.study, bars, it.params) });
    };
    return {
      post(m) {
        if (m.type === "data") { key = m.key; bars = m.bars.slice(); insts.forEach((_, id) => run(id)); }
        else if (m.type === "bar" && m.key === key) {
          if (bars.length && bars[bars.length - 1].time === m.bar.time) bars[bars.length - 1] = m.bar; else bars.push(m.bar);
          insts.forEach((_, id) => run(id));
        } else if (m.type === "set") {
          const study = STUDIES.find((s) => s.id === m.study);
          if (!study) { send({ type: "error", id: m.id, message: `unknown study ${m.study}` }); return; }
          insts.set(m.id, { study, params: m.params });
          send({ type: "meta", id: m.id, inputs: study.inputs, config: { shortTitle: study.shortTitle, overlay: study.overlay } });
          run(m.id);
        } else if (m.type === "remove") insts.delete(m.id);
      },
      close() { insts.clear(); },
    };
  },
};
