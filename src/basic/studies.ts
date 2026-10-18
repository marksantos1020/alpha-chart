import type { StudyEntry } from "../types";
import type { HLine, IndicatorConfig, InputDef } from "../indicators/types";
import {
  change, ema, hma, highest, lowest, map, map2, meanDev, rma, rsi, sma, stdev, stoch, sum, trueRange, wma, type Arr,
} from "./math";

export interface Series {
  t: Arr; o: Arr; h: Arr; l: Arr; c: Arr; v: Arr;
}

export interface Ctx extends Series {
  p: Record<string, any>;
  src(name?: string): Arr;
}

export interface PlotOut {
  title: string; values: Arr; color: string;
  style?: string; width?: number; lineStyle?: string; colorUp?: string; colorDown?: string; colorBy?: string; display?: string;
}
export interface BandOut { title: string; upper: Arr | number; lower: Arr | number; color: string }
export interface StudyOut { plots: PlotOut[]; bands?: BandOut[]; hlines?: HLine[] }

export interface Study extends StudyEntry {
  inputs: InputDef[];
  config: IndicatorConfig;
  run(x: Ctx): StudyOut;
}

export const SOURCES = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4", "hlcc4"];

const BLUE = "#2962FF", ORANGE = "#FF6D00", PURPLE = "#7E57C2", GREEN = "#26A69A", TEAL = "#089981", RED = "#F23645", GREY = "#787B86";
const BAND_FILL = "rgba(33,150,243,0.05)", OSC_FILL = "rgba(126,87,194,0.1)";

const int = (name: string, d: number, min = 1, max = 1000): InputDef => ({ name, type: "int", default: d, min, max });
const float = (name: string, d: number, step = 0.1, min = 0): InputDef => ({ name, type: "float", default: d, step, min });
const source = (d = "close"): InputDef => ({ name: "Source", type: "source", default: d, options: SOURCES });
const levels = (hi: number, lo: number, mid?: number): HLine[] => [
  { value: hi, color: GREY, style: "dashed" }, ...(mid === undefined ? [] : [{ value: mid, color: GREY, style: "dotted" }]), { value: lo, color: GREY, style: "dashed" },
];
const band = (hi: number, lo: number): BandOut => ({ title: "Background", upper: hi, lower: lo, color: OSC_FILL });

function ma(id: string, name: string, shortTitle: string, len: number, f: (x: Arr, n: number) => Arr, description: string, color = BLUE): Study {
  return {
    id, name, shortTitle, overlay: true, category: "Moving averages", description,
    inputs: [int("Length", len), source()], config: { shortTitle, overlay: true },
    run: (x) => ({ plots: [{ title: shortTitle, values: f(x.src(x.p.Source), x.p.Length), color }] }),
  };
}

function supertrend(x: Ctx, factor: number, len: number) {
  const atr = rma(trueRange(x.h, x.l, x.c), len), n = x.c.length;
  const line = new Float64Array(n).fill(NaN), dir = new Float64Array(n).fill(NaN);
  let pUp = NaN, pDn = NaN, pLine = NaN, pAtr = NaN;
  for (let i = 0; i < n; i++) {
    const a = atr[i];
    if (Number.isNaN(a)) continue;
    const hl2 = (x.h[i] + x.l[i]) / 2, close = x.c[i], pc = i ? x.c[i - 1] : NaN;
    let up = hl2 + factor * a, dn = hl2 - factor * a;
    if (!Number.isNaN(pDn) && !(dn > pDn || pc < pDn)) dn = pDn;
    if (!Number.isNaN(pUp) && !(up < pUp || pc > pUp)) up = pUp;
    const d = Number.isNaN(pAtr) ? 1 : pLine === pUp ? (close > up ? -1 : 1) : close < dn ? 1 : -1;
    line[i] = d === -1 ? dn : up; dir[i] = d;
    pUp = up; pDn = dn; pLine = line[i]; pAtr = a;
  }
  return { line, dir };
}

function sar(x: Ctx, start: number, inc: number, max: number): Arr {
  const n = x.c.length, out = new Float64Array(n).fill(NaN);
  let result = NaN, maxMin = NaN, acc = NaN, below = false;
  for (let i = 1; i < n; i++) {
    let first = false;
    if (i === 1) {
      below = x.c[1] > x.c[0];
      maxMin = below ? x.h[1] : x.l[1];
      result = below ? x.l[0] : x.h[0];
      first = true;
      acc = start;
    }
    result += acc * (maxMin - result);
    if (below) {
      if (result > x.l[i]) { first = true; below = false; result = Math.max(x.h[i], maxMin); maxMin = x.l[i]; acc = start; }
    } else if (result < x.h[i]) { first = true; below = true; result = Math.min(x.l[i], maxMin); maxMin = x.h[i]; acc = start; }
    if (!first) {
      if (below && x.h[i] > maxMin) { maxMin = x.h[i]; acc = Math.min(acc + inc, max); }
      if (!below && x.l[i] < maxMin) { maxMin = x.l[i]; acc = Math.min(acc + inc, max); }
    }
    if (below) { result = Math.min(result, x.l[i - 1]); if (i > 1) result = Math.min(result, x.l[i - 2]); }
    else { result = Math.max(result, x.h[i - 1]); if (i > 1) result = Math.max(result, x.h[i - 2]); }
    out[i] = result;
  }
  return out;
}

function fixnan(x: Arr): Arr {
  let last = NaN;
  return map(x, (v) => (Number.isNaN(v) ? last : (last = v)));
}

function adx(x: Ctx, diLen: number, adxLen: number): Arr {
  const up = change(x.h), down = map(change(x.l), (v) => -v);
  const plusDM = map2(up, down, (u, d) => (Number.isNaN(u) ? NaN : u > d && u > 0 ? u : 0));
  const minusDM = map2(up, down, (u, d) => (Number.isNaN(d) ? NaN : d > u && d > 0 ? d : 0));
  const tr = trueRange(x.h, x.l, x.c);
  tr[0] = NaN;
  const atr = rma(tr, diLen);
  const plus = fixnan(map2(rma(plusDM, diLen), atr, (a, b) => (100 * a) / b));
  const minus = fixnan(map2(rma(minusDM, diLen), atr, (a, b) => (100 * a) / b));
  return map(rma(map2(plus, minus, (p, m) => Math.abs(p - m) / (p + m === 0 ? 1 : p + m)), adxLen), (v) => 100 * v);
}

function vwap(x: Ctx): Arr {
  const tp = x.src("hlc3");
  let day = NaN, pv = 0, vol = 0;
  return map(tp, (p, i) => {
    const d = Math.floor(x.t[i] / 86_400_000);
    if (d !== day) { day = d; pv = 0; vol = 0; }
    pv += p * x.v[i]; vol += x.v[i];
    return vol ? pv / vol : NaN;
  });
}

export const STUDIES: Study[] = [
  ma("sma", "Moving Average Simple", "SMA", 9, sma, "Arithmetic mean of the last N values"),
  ma("ema", "Moving Average Exponential", "EMA", 9, ema, "Exponentially weighted mean, faster than the SMA"),
  ma("wma", "Moving Average Weighted", "WMA", 9, wma, "Linearly weighted mean of the last N values"),
  ma("hma", "Hull Moving Average", "HMA", 9, hma, "Weighted averages combined to cut lag", "#00897B"),
  {
    id: "vwma", name: "Volume Weighted Moving Average", shortTitle: "VWMA", overlay: true, category: "Moving averages",
    description: "Mean weighted by each bar's volume", inputs: [int("Length", 20), source()], config: { shortTitle: "VWMA", overlay: true },
    run: (x) => {
      const s = x.src(x.p.Source), n = x.p.Length;
      return { plots: [{ title: "VWMA", values: map2(sma(map2(s, x.v, (a, b) => a * b), n), sma(x.v, n), (a, b) => a / b), color: BLUE }] };
    },
  },
  {
    id: "bbands", name: "Bollinger Bands", shortTitle: "BB", overlay: true, category: "Bands & channels",
    description: "SMA basis with standard-deviation bands", inputs: [int("Length", 20), source(), float("StdDev", 2)], config: { shortTitle: "BB", overlay: true },
    run: (x) => {
      const s = x.src(x.p.Source), basis = sma(s, x.p.Length), dev = stdev(s, x.p.Length), k = x.p.StdDev;
      const upper = map2(basis, dev, (b, d) => b + k * d), lower = map2(basis, dev, (b, d) => b - k * d);
      return {
        plots: [{ title: "Basis", values: basis, color: ORANGE }, { title: "Upper", values: upper, color: BLUE }, { title: "Lower", values: lower, color: TEAL }],
        bands: [{ title: "Background", upper, lower, color: BAND_FILL }],
      };
    },
  },
  {
    id: "keltner", name: "Keltner Channels", shortTitle: "KC", overlay: true, category: "Bands & channels",
    description: "EMA basis with ATR bands", inputs: [int("Length", 20), float("Multiplier", 2), source(), int("ATR length", 10)], config: { shortTitle: "KC", overlay: true },
    run: (x) => {
      const basis = ema(x.src(x.p.Source), x.p.Length), range = rma(trueRange(x.h, x.l, x.c), x.p["ATR length"]), k = x.p.Multiplier;
      const upper = map2(basis, range, (b, r) => b + k * r), lower = map2(basis, range, (b, r) => b - k * r);
      return {
        plots: [{ title: "Upper", values: upper, color: BLUE }, { title: "Basis", values: basis, color: BLUE }, { title: "Lower", values: lower, color: BLUE }],
        bands: [{ title: "Background", upper, lower, color: BAND_FILL }],
      };
    },
  },
  {
    id: "donchian", name: "Donchian Channels", shortTitle: "DC", overlay: true, category: "Bands & channels",
    description: "Highest high and lowest low of N bars", inputs: [int("Length", 20)], config: { shortTitle: "DC", overlay: true },
    run: (x) => {
      const upper = highest(x.h, x.p.Length), lower = lowest(x.l, x.p.Length);
      return {
        plots: [{ title: "Upper", values: upper, color: BLUE }, { title: "Basis", values: map2(upper, lower, (a, b) => (a + b) / 2), color: ORANGE }, { title: "Lower", values: lower, color: BLUE }],
        bands: [{ title: "Background", upper, lower, color: BAND_FILL }],
      };
    },
  },
  {
    id: "envelope", name: "Envelope", shortTitle: "Env", overlay: true, category: "Bands & channels",
    description: "Moving average with fixed percentage bands", inputs: [int("Length", 20), float("Percent", 10, 0.5), source(), { name: "Exponential", type: "bool", default: false }],
    config: { shortTitle: "Env", overlay: true },
    run: (x) => {
      const s = x.src(x.p.Source), basis = x.p.Exponential ? ema(s, x.p.Length) : sma(s, x.p.Length), k = x.p.Percent / 100;
      const upper = map(basis, (b) => b * (1 + k)), lower = map(basis, (b) => b * (1 - k));
      return {
        plots: [{ title: "Basis", values: basis, color: ORANGE }, { title: "Upper", values: upper, color: BLUE }, { title: "Lower", values: lower, color: BLUE }],
        bands: [{ title: "Background", upper, lower, color: BAND_FILL }],
      };
    },
  },
  {
    id: "vwap", name: "Volume Weighted Average Price", shortTitle: "VWAP", overlay: true, category: "Trend",
    description: "Average price weighted by volume, reset every UTC day", inputs: [], config: { shortTitle: "VWAP", overlay: true },
    run: (x) => ({ plots: [{ title: "VWAP", values: vwap(x), color: BLUE }] }),
  },
  {
    id: "supertrend", name: "Supertrend", shortTitle: "Supertrend", overlay: true, category: "Trend",
    description: "ATR trailing line that flips with the trend", inputs: [int("ATR length", 10), float("Factor", 3, 0.01, 0.01)],
    config: { shortTitle: "Supertrend", overlay: true },
    run: (x) => {
      const { line, dir } = supertrend(x, x.p.Factor, x.p["ATR length"]);
      return { plots: [
        { title: "Up trend", values: map2(line, dir, (v, d) => (d < 0 ? v : NaN)), color: TEAL },
        { title: "Down trend", values: map2(line, dir, (v, d) => (d > 0 ? v : NaN)), color: RED },
      ] };
    },
  },
  {
    id: "psar", name: "Parabolic SAR", shortTitle: "SAR", overlay: true, category: "Trend",
    description: "Stop-and-reverse points that trail the trend", inputs: [float("Start", 0.02, 0.01), float("Increment", 0.02, 0.01), float("Maximum", 0.2, 0.01)],
    config: { shortTitle: "SAR", overlay: true },
    run: (x) => ({ plots: [{ title: "ParabolicSAR", values: sar(x, x.p.Start, x.p.Increment, x.p.Maximum), color: BLUE, style: "cross" }] }),
  },
  {
    id: "adx", name: "Average Directional Index", shortTitle: "ADX", overlay: false, category: "Trend",
    description: "Trend strength from 0 to 100", inputs: [int("ADX smoothing", 14), int("DI length", 14)], config: { shortTitle: "ADX", overlay: false, precision: 2 },
    run: (x) => ({ plots: [{ title: "ADX", values: adx(x, x.p["DI length"], x.p["ADX smoothing"]), color: "#FF5252" }] }),
  },
  {
    id: "rsi", name: "Relative Strength Index", shortTitle: "RSI", overlay: false, category: "Oscillators",
    description: "Momentum from 0 to 100 with 70/30 levels", inputs: [int("Length", 14), source()], config: { shortTitle: "RSI", overlay: false, precision: 2 },
    run: (x) => ({ plots: [{ title: "RSI", values: rsi(x.src(x.p.Source), x.p.Length), color: PURPLE }], hlines: levels(70, 30, 50), bands: [band(70, 30)] }),
  },
  {
    id: "macd", name: "MACD", shortTitle: "MACD", overlay: false, category: "Oscillators",
    description: "EMA difference, signal line and histogram",
    inputs: [int("Fast length", 12), int("Slow length", 26), source(), int("Signal smoothing", 9, 1, 50)], config: { shortTitle: "MACD", overlay: false },
    run: (x) => {
      const s = x.src(x.p.Source), line = map2(ema(s, x.p["Fast length"]), ema(s, x.p["Slow length"]), (a, b) => a - b);
      const signal = ema(line, x.p["Signal smoothing"]);
      return { plots: [
        { title: "Histogram", values: map2(line, signal, (a, b) => a - b), color: GREEN, style: "columns", colorUp: GREEN, colorDown: "#FF5252" },
        { title: "MACD", values: line, color: BLUE },
        { title: "Signal", values: signal, color: ORANGE },
      ], hlines: [{ value: 0, color: GREY, style: "dotted" }] };
    },
  },
  {
    id: "stoch", name: "Stochastic", shortTitle: "Stoch", overlay: false, category: "Oscillators",
    description: "Close within the N-bar range, %K and %D", inputs: [int("%K length", 14), int("%K smoothing", 1), int("%D smoothing", 3)],
    config: { shortTitle: "Stoch", overlay: false, precision: 2 },
    run: (x) => {
      const k = sma(stoch(x.c, x.h, x.l, x.p["%K length"]), x.p["%K smoothing"]);
      return { plots: [{ title: "%K", values: k, color: BLUE }, { title: "%D", values: sma(k, x.p["%D smoothing"]), color: ORANGE }], hlines: levels(80, 20, 50), bands: [band(80, 20)] };
    },
  },
  {
    id: "stochrsi", name: "Stochastic RSI", shortTitle: "Stoch RSI", overlay: false, category: "Oscillators",
    description: "Stochastic applied to the RSI", inputs: [int("K", 3), int("D", 3), int("RSI length", 14), int("Stochastic length", 14), source()],
    config: { shortTitle: "Stoch RSI", overlay: false, precision: 2 },
    run: (x) => {
      const r = rsi(x.src(x.p.Source), x.p["RSI length"]), k = sma(stoch(r, r, r, x.p["Stochastic length"]), x.p.K);
      return { plots: [{ title: "K", values: k, color: BLUE }, { title: "D", values: sma(k, x.p.D), color: ORANGE }], hlines: levels(80, 20, 50), bands: [band(80, 20)] };
    },
  },
  {
    id: "cci", name: "Commodity Channel Index", shortTitle: "CCI", overlay: false, category: "Oscillators",
    description: "Distance from the mean in units of mean deviation", inputs: [int("Length", 20), source("hlc3")], config: { shortTitle: "CCI", overlay: false, precision: 2 },
    run: (x) => {
      const s = x.src(x.p.Source), m = sma(s, x.p.Length), d = meanDev(s, x.p.Length);
      return { plots: [{ title: "CCI", values: map(s, (v, i) => (v - m[i]) / (0.015 * d[i])), color: BLUE }], hlines: levels(100, -100, 0), bands: [band(100, -100)] };
    },
  },
  {
    id: "williamsr", name: "Williams %R", shortTitle: "%R", overlay: false, category: "Oscillators",
    description: "Close relative to the N-bar high, from -100 to 0", inputs: [int("Length", 14)], config: { shortTitle: "%R", overlay: false, precision: 2 },
    run: (x) => {
      const hh = highest(x.h, x.p.Length), ll = lowest(x.l, x.p.Length);
      return { plots: [{ title: "%R", values: map(x.c, (c, i) => (100 * (c - hh[i])) / (hh[i] - ll[i])), color: PURPLE }], hlines: levels(-20, -80, -50), bands: [band(-20, -80)] };
    },
  },
  {
    id: "momentum", name: "Momentum", shortTitle: "Mom", overlay: false, category: "Oscillators",
    description: "Change over N bars", inputs: [int("Length", 10), source()], config: { shortTitle: "Mom", overlay: false },
    run: (x) => ({ plots: [{ title: "Mom", values: change(x.src(x.p.Source), x.p.Length), color: BLUE }], hlines: [{ value: 0, color: GREY, style: "dotted" }] }),
  },
  {
    id: "roc", name: "Rate Of Change", shortTitle: "ROC", overlay: false, category: "Oscillators",
    description: "Percent change over N bars", inputs: [int("Length", 9), source()], config: { shortTitle: "ROC", overlay: false, precision: 2 },
    run: (x) => {
      const s = x.src(x.p.Source), n = x.p.Length;
      return { plots: [{ title: "ROC", values: map(s, (v, i) => (i >= n ? (100 * (v - s[i - n])) / s[i - n] : NaN)), color: BLUE }], hlines: [{ value: 0, color: GREY, style: "dotted" }] };
    },
  },
  {
    id: "atr", name: "Average True Range", shortTitle: "ATR", overlay: false, category: "Oscillators",
    description: "Volatility: smoothed true range", inputs: [int("Length", 14)], config: { shortTitle: "ATR", overlay: false },
    run: (x) => ({ plots: [{ title: "ATR", values: rma(trueRange(x.h, x.l, x.c), x.p.Length), color: "#B71C1C" }] }),
  },
  {
    id: "volume", name: "Volume", shortTitle: "Vol", overlay: false, category: "Volume",
    description: "Volume coloured by bar direction, with a moving average", inputs: [int("MA length", 20)], config: { shortTitle: "Vol", overlay: false, format: "volume" },
    run: (x) => ({ plots: [
      { title: "Volume", values: x.v, color: GREEN, style: "columns", colorBy: "candle", colorUp: "rgba(8,153,129,0.5)", colorDown: "rgba(242,54,69,0.5)" },
      { title: "Volume MA", values: sma(x.v, x.p["MA length"]), color: BLUE },
    ] }),
  },
  {
    id: "obv", name: "On Balance Volume", shortTitle: "OBV", overlay: false, category: "Volume",
    description: "Cumulative volume signed by the close-to-close move", inputs: [], config: { shortTitle: "OBV", overlay: false, format: "volume" },
    run: (x) => {
      let acc = 0;
      return { plots: [{ title: "OBV", values: map(x.c, (c, i) => { if (i) acc += c > x.c[i - 1] ? x.v[i] : c < x.c[i - 1] ? -x.v[i] : 0; return acc; }), color: BLUE }] };
    },
  },
  {
    id: "mfi", name: "Money Flow Index", shortTitle: "MFI", overlay: false, category: "Volume",
    description: "Volume-weighted RSI of the typical price", inputs: [int("Length", 14)], config: { shortTitle: "MFI", overlay: false, precision: 2 },
    run: (x) => {
      const s = x.src("hlc3"), ch = change(s), n = x.p.Length;
      const up = sum(map(s, (v, i) => (Number.isNaN(ch[i]) ? NaN : x.v[i] * (ch[i] <= 0 ? 0 : v))), n);
      const dn = sum(map(s, (v, i) => (Number.isNaN(ch[i]) ? NaN : x.v[i] * (ch[i] >= 0 ? 0 : v))), n);
      return { plots: [{ title: "MF", values: map2(up, dn, (u, d) => 100 - 100 / (1 + u / d)), color: PURPLE }], hlines: levels(80, 20, 50), bands: [band(80, 20)] };
    },
  },
  {
    id: "cmf", name: "Chaikin Money Flow", shortTitle: "CMF", overlay: false, category: "Volume",
    description: "Buying versus selling pressure over N bars", inputs: [int("Length", 20)], config: { shortTitle: "CMF", overlay: false, precision: 3 },
    run: (x) => {
      const ad = map(x.c, (c, i) => { const h = x.h[i], l = x.l[i]; return h === l ? 0 : ((2 * c - l - h) / (h - l)) * x.v[i]; });
      return { plots: [{ title: "CMF", values: map2(sum(ad, x.p.Length), sum(x.v, x.p.Length), (a, b) => a / b), color: "#43A047" }], hlines: [{ value: 0, color: GREY, style: "dotted" }] };
    },
  },
];
