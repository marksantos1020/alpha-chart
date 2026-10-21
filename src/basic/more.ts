import type { DrawFrame, DrawLabel, DrawLine, InputDef } from "../indicators/types";
import { change, ema, highest, lowest, map, map2, rma, sma, stdev, sum, trueRange, wma, type Arr } from "./math";
import {
  BLUE, GREY, MA_TYPES, ORANGE, RED, TEAL, band, dmi, float, int, levels, movingAverage, source,
  type Ctx, type Study, type StudyOut,
} from "./studies";

const zero = { value: 0, color: GREY, style: "dotted" };
const bool = (name: string, d: boolean): InputDef => ({ name, type: "bool", default: d });
const select = (name: string, d: string, options: string[]): InputDef => ({ name, type: "select", default: d, options });

export function ago(x: Arr, k: number): Arr { return map(x, (_, i) => (i - k >= 0 && i - k < x.length ? x[i - k] : NaN)); }

export function alma(x: Arr, len: number, offset: number, sigma: number): Arr {
  const m = offset * (len - 1), s2 = 2 * (len / sigma) ** 2;
  const w = Array.from({ length: len }, (_, i) => Math.exp(-((i - m) ** 2) / s2)), norm = w.reduce((a, b) => a + b, 0);
  return map(x, (_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let j = 0; j < len; j++) s += x[i - (len - 1 - j)] * w[j];
    return s / norm;
  });
}

export function linreg(x: Arr, len: number, offset = 0): Arr {
  return map(x, (_, i) => {
    if (i < len - 1) return NaN;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = 0; k < len; k++) { const xx = len - 1 - k, y = x[i - k]; sx += xx; sy += y; sxx += xx * xx; sxy += xx * y; }
    const den = len * sxx - sx * sx, slope = den ? (len * sxy - sx * sy) / den : 0;
    return (sy - slope * sx) / len + slope * (len - 1 - offset);
  });
}

export function extremeBars(x: Arr, len: number, hi: boolean): Arr {
  return map(x, (_, i) => {
    if (i < len - 1) return NaN;
    let best = i;
    for (let j = i; j > i - len; j--) if (hi ? x[j] > x[best] : x[j] < x[best]) best = j;
    return best - i;
  });
}

export function pivot(x: Arr, left: number, right: number, hi: boolean): Arr {
  return map(x, (_, i) => {
    const c = i - right;
    if (c - left < 0) return NaN;
    for (let j = c - left; j <= i; j++) if (j !== c && (hi ? x[j] >= x[c] : x[j] <= x[c])) return NaN;
    return x[c];
  });
}

export function accdist(x: Ctx): Arr {
  let acc = 0;
  return map(x.c, (c, i) => { const r = x.h[i] - x.l[i]; if (r > 0) acc += ((2 * c - x.l[i] - x.h[i]) / r) * x.v[i]; return acc; });
}

export function cmo(s: Arr, len: number): Arr {
  const ch = change(s);
  const up = sum(map(ch, (v) => (Number.isNaN(v) ? NaN : v >= 0 ? v : 0)), len), dn = sum(map(ch, (v) => (Number.isNaN(v) ? NaN : v >= 0 ? 0 : -v)), len);
  return map2(up, dn, (u, d) => (u + d ? (100 * (u - d)) / (u + d) : NaN));
}

export function tsi(s: Arr, short: number, long: number): Arr {
  const ch = change(s);
  return map2(ema(ema(ch, long), short), ema(ema(map(ch, Math.abs), long), short), (a, b) => (b ? a / b : NaN));
}

const hl2 = (x: Ctx) => map2(x.h, x.l, (h, l) => (h + l) / 2);
const donchian = (x: Ctx, n: number) => map2(lowest(x.l, n), highest(x.h, n), (l, h) => (l + h) / 2);
const swma = (s: Arr) => map(s, (v, i) => (i < 3 ? NaN : (s[i - 3] + 2 * s[i - 2] + 2 * s[i - 1] + v) / 6));
const fmtPrice = (p: number) => { const d = p > 0 ? Math.max(2, 4 - Math.floor(Math.log10(p))) : 2; return String(Math.round(p * 10 ** d) / 10 ** d); };
const empty = (): DrawFrame => ({ lines: [], labels: [], boxes: [] });

function study(id: string, name: string, shortTitle: string, overlay: boolean, category: string, description: string,
               inputs: InputDef[], run: (x: Ctx) => StudyOut, extra: { precision?: number; format?: "price" | "percent" | "volume" } = {}): Study {
  return { id, name, shortTitle, overlay, category, description, inputs, config: { shortTitle, overlay, ...extra }, run };
}

export const MORE_STUDIES: Study[] = [
  study("dema", "Double EMA", "DEMA", true, "Moving averages", "Double EMA: 2 x EMA minus EMA of EMA, less lag", [int("Length", 9), source()], (x) => {
    const e1 = ema(x.src(x.p.Source), x.p.Length), e2 = ema(e1, x.p.Length);
    return { plots: [{ title: "DEMA", values: map2(e1, e2, (a, b) => 2 * a - b), color: "#43A047" }] };
  }),
  study("tema", "Triple EMA", "TEMA", true, "Moving averages", "Triple EMA: three nested EMAs combined to cut lag further", [int("Length", 9), source()], (x) => {
    const e1 = ema(x.src(x.p.Source), x.p.Length), e2 = ema(e1, x.p.Length), e3 = ema(e2, x.p.Length);
    return { plots: [{ title: "TEMA", values: map(e1, (a, i) => 3 * (a - e2[i]) + e3[i]), color: BLUE }] };
  }),
  study("alma", "Arnaud Legoux Moving Average", "ALMA", true, "Moving averages", "Gaussian-weighted window with an adjustable centre",
    [int("Window size", 9), float("Offset", 0.85, 0.05), float("Sigma", 6, 0.5, 0.1), source()],
    (x) => ({ plots: [{ title: "ALMA", values: alma(x.src(x.p.Source), x.p["Window size"], x.p.Offset, x.p.Sigma), color: BLUE }] })),
  study("smma", "Smoothed Moving Average", "SMMA", true, "Moving averages", "Smoothed (Wilder) moving average", [int("Length", 7), source()],
    (x) => ({ plots: [{ title: "SMMA", values: rma(x.src(x.p.Source), x.p.Length), color: "#673AB7" }] })),
  study("lsma", "Least Squares Moving Average", "LSMA", true, "Moving averages", "Least squares line through the last N closes, at its end",
    [int("Length", 25), int("Offset", 0, -500, 500), source()],
    (x) => ({ plots: [{ title: "LSMA", values: linreg(x.src(x.p.Source), x.p.Length, x.p.Offset), color: BLUE }] })),
  study("macross", "MA Cross", "MA Cross", true, "Moving averages", "Short and long SMA with a mark where they cross",
    [int("Short MA length", 9), int("Long MA length", 21), source()], (x) => {
      const s = x.src(x.p.Source), fast = sma(s, x.p["Short MA length"]), slow = sma(s, x.p["Long MA length"]);
      const cross = map(fast, (f, i) => (i && [f, slow[i], fast[i - 1], slow[i - 1]].every(Number.isFinite) && (f > slow[i]) !== (fast[i - 1] > slow[i - 1]) ? f : NaN));
      return { plots: [{ title: "Short", values: fast, color: ORANGE }, { title: "Long", values: slow, color: BLUE },
                       { title: "Cross", values: cross, color: "#43A047", style: "cross", width: 4 }] };
    }),
  study("maribbon", "Moving Average Ribbon", "MA Ribbon", true, "Moving averages", "Four moving averages of one type, 20 to 200 bars",
    [select("MA type", "SMA", MA_TYPES), source(), int("MA #1 length", 20), int("MA #2 length", 50), int("MA #3 length", 100), int("MA #4 length", 200)], (x) => {
      const s = x.src(x.p.Source), f = (k: number) => movingAverage(x.p["MA type"], s, x.v, x.p[`MA #${k} length`]);
      return { plots: [["#F6C309", 1], ["#FB9800", 2], ["#FB6500", 3], ["#F60C0C", 4]].map(([c, k]) => ({ title: `MA #${k}`, values: f(k as number), color: c as string })) };
    }),
  study("bbpercentb", "Bollinger Bands %B", "BB %B", false, "Bands & channels", "Where price sits within the Bollinger Bands, 0 = lower, 1 = upper",
    [int("Length", 20), source(), float("StdDev", 2)], (x) => {
      const s = x.src(x.p.Source), m = sma(s, x.p.Length), d = stdev(s, x.p.Length), k = x.p.StdDev;
      return { plots: [{ title: "%B", values: map(s, (v, i) => (d[i] ? (v - (m[i] - k * d[i])) / (2 * k * d[i]) : NaN)), color: "#22AB94" }],
               hlines: levels(1, 0, 0.5), bands: [{ title: "Background", upper: 1, lower: 0, color: "rgba(38,166,154,0.1)" }] };
    }, { precision: 2 }),
  study("bbw", "Bollinger BandWidth", "BBW", false, "Bands & channels", "Bollinger band width relative to the basis, with expansion and contraction marks",
    [int("Length", 20), source(), float("StdDev", 2), int("Expansion/contraction lookback", 125)], (x) => {
      const s = x.src(x.p.Source), m = sma(s, x.p.Length), d = stdev(s, x.p.Length), w = map2(m, d, (a, b) => (a ? (2 * x.p.StdDev * b) / a : NaN));
      const n = x.p["Expansion/contraction lookback"];
      return { plots: [{ title: "Bollinger BandWidth", values: w, color: BLUE }, { title: "Highest expansion", values: highest(w, n), color: RED },
                       { title: "Lowest contraction", values: lowest(w, n), color: "#26A69A" }] };
    }, { precision: 4 }),
  study("dmi", "Directional Movement Index", "DMI", false, "Trend", "+DI and -DI directional movement with ADX trend strength",
    [int("ADX smoothing", 14, 1, 50), int("DI length", 14)], (x) => {
      const d = dmi(x, x.p["DI length"], x.p["ADX smoothing"]);
      return { plots: [{ title: "ADX", values: d.adx, color: "#F50057" }, { title: "+DI", values: d.plus, color: BLUE }, { title: "-DI", values: d.minus, color: ORANGE }] };
    }, { precision: 2 }),
  study("aroon", "Aroon", "Aroon", false, "Trend", "Bars since the N-bar high and low, as 0 to 100", [int("Length", 14)], (x) => {
    const n = x.p.Length, f = (b: number) => (100 * (b + n)) / n;
    return { plots: [{ title: "Aroon Up", values: map(extremeBars(x.h, n + 1, true), f), color: "#FB8C00" },
                     { title: "Aroon Down", values: map(extremeBars(x.l, n + 1, false), f), color: BLUE }] };
  }, { precision: 2 }),
  study("vortex", "Vortex Indicator", "VI", false, "Trend", "VI+ and VI- trend lines from upward and downward movement", [int("Length", 14, 2)], (x) => {
    const n = x.p.Length, str = sum(trueRange(x.h, x.l, x.c), n);
    const vmp = sum(map(x.h, (h, i) => (i ? Math.abs(h - x.l[i - 1]) : NaN)), n), vmm = sum(map(x.l, (l, i) => (i ? Math.abs(l - x.h[i - 1]) : NaN)), n);
    return { plots: [{ title: "VI +", values: map2(vmp, str, (a, b) => a / b), color: BLUE }, { title: "VI -", values: map2(vmm, str, (a, b) => a / b), color: "#E91E63" }] };
  }, { precision: 4 }),
  study("chop", "Choppiness Index", "CHOP", false, "Trend", "Choppiness: high when the market ranges, low when it trends", [int("Length", 14, 2)], (x) => {
    const n = x.p.Length, a = sum(trueRange(x.h, x.l, x.c), n), hh = highest(x.h, n), ll = lowest(x.l, n);
    return { plots: [{ title: "CHOP", values: map(a, (v, i) => (100 * Math.log10(v / (hh[i] - ll[i]))) / Math.log10(n)), color: BLUE }],
             hlines: levels(61.8, 38.2, 50), bands: [band(61.8, 38.2)] };
  }, { precision: 2 }),
  study("ichimoku", "Ichimoku Cloud", "Ichimoku", true, "Trend", "Conversion and base lines, a lagging span and the cloud projected 26 bars ahead",
    [int("Conversion line length", 9), int("Base line length", 26), int("Leading span B length", 52), int("Lagging span", 26, 1, 500)], (x) => {
      const conv = donchian(x, x.p["Conversion line length"]), base = donchian(x, x.p["Base line length"]);
      const a = map2(conv, base, (p, q) => (p + q) / 2), b = donchian(x, x.p["Leading span B length"]), d = x.p["Lagging span"];
      return {
        plots: [{ title: "Conversion Line", values: conv, color: BLUE }, { title: "Base Line", values: base, color: "#B71C1C" },
                { title: "Lagging Span", values: x.c, color: "#43A047", offset: 1 - d },
                { title: "Leading Span A", values: a, color: "#A5D6A7", offset: d - 1 }, { title: "Leading Span B", values: b, color: "#EF9A9A", offset: d - 1 }],
        bands: [{ title: "Cloud", upper: a, lower: b, color: "rgba(67,160,71,0.1)", colorDown: "rgba(244,67,54,0.1)", offset: d - 1 }],
      };
    }),
  study("alligator", "Williams Alligator", "Alligator", true, "Trend", "Three smoothed averages shifted forward: jaw, teeth and lips",
    [int("Jaw length", 13), int("Teeth length", 8), int("Lips length", 5), int("Jaw offset", 8, -500, 500), int("Teeth offset", 5, -500, 500), int("Lips offset", 3, -500, 500)], (x) => {
      const m = hl2(x);
      return { plots: [{ title: "Jaw", values: rma(m, x.p["Jaw length"]), color: BLUE, offset: x.p["Jaw offset"] },
                       { title: "Teeth", values: rma(m, x.p["Teeth length"]), color: "#E91E63", offset: x.p["Teeth offset"] },
                       { title: "Lips", values: rma(m, x.p["Lips length"]), color: "#66BB6A", offset: x.p["Lips offset"] }] };
    }),
  study("fractals", "Williams Fractals", "Fractals", true, "Support & resistance", "Marks highs and lows that stand above or below their neighbours",
    [int("Periods", 2, 2, 50)], (x) => {
      const n = x.p.Periods, isSet = (a: Arr) => map(a, (v) => (Number.isNaN(v) ? 0 : 1));
      return { plots: [], shapes: [
        { cond: isSet(pivot(x.h, n, n, true)), shape: "triangleDown", location: "aboveBar", color: TEAL, offset: -n },
        { cond: isSet(pivot(x.l, n, n, false)), shape: "triangleUp", location: "belowBar", color: RED, offset: -n },
      ] };
    }),
  study("pivots", "Pivot Points Standard", "Pivots", true, "Support & resistance", "Daily or weekly pivot levels from the previous period, five formulas",
    [select("Type", "Traditional", ["Traditional", "Fibonacci", "Woodie", "Classic", "Camarilla"]), select("Pivots timeframe", "1D", ["1D", "1W"]),
     int("Number of pivots back", 15, 1, 50), bool("Show labels", true)], (x) => pivotLevels(x)),
  study("zigzag", "Zig Zag", "ZigZag", true, "Support & resistance", "Joins swing highs and lows that reverse by more than a set percentage",
    [float("Price deviation for reversals (%)", 5, 0.5, 0.01), bool("Show price labels", true)], (x) => zigzag(x)),
  study("linregchannel", "Linear Regression Channel", "LinReg", true, "Support & resistance", "Regression line through the last N bars with deviation bands",
    [int("Length", 100, 2, 2000), float("Deviation", 2), bool("Extend right", true), source()], (x) => regressionChannel(x)),
  study("ao", "Awesome Oscillator", "AO", false, "Oscillators", "5-bar minus 34-bar SMA of the bar midpoint", [], (x) => {
    const m = hl2(x), ao = map2(sma(m, 5), sma(m, 34), (a, b) => a - b), d = change(ao);
    return { plots: [{ title: "AO", values: ao, color: TEAL, style: "columns", palette: [TEAL, RED], colors: map(d, (v) => (Number.isNaN(v) ? NaN : v >= 0 ? 0 : 1)) }] };
  }),
  study("trix", "TRIX", "TRIX", false, "Oscillators", "Rate of change of a triple-smoothed EMA of the log price", [int("Length", 18)], (x) => {
    const n = x.p.Length, e = ema(ema(ema(map(x.c, Math.log), n), n), n);
    return { plots: [{ title: "TRIX", values: map(change(e), (v) => 10000 * v), color: RED }], hlines: [zero] };
  }, { precision: 4 }),
  study("uo", "Ultimate Oscillator", "UO", false, "Oscillators", "Weighted buying pressure over three lookbacks, 0 to 100",
    [int("Fast length", 7), int("Middle length", 14), int("Slow length", 28)], (x) => {
      const pc = ago(x.c, 1), bp = map(x.c, (c, i) => c - Math.min(x.l[i], pc[i])), tr = map(x.h, (h, i) => Math.max(h, pc[i]) - Math.min(x.l[i], pc[i]));
      const avg = (n: number) => map2(sum(bp, n), sum(tr, n), (a, b) => a / b);
      const a = avg(x.p["Fast length"]), b = avg(x.p["Middle length"]), c = avg(x.p["Slow length"]);
      return { plots: [{ title: "UO", values: map(a, (v, i) => (100 * (4 * v + 2 * b[i] + c[i])) / 7), color: RED }] };
    }, { precision: 2 }),
  study("cmo", "Chande Momentum Oscillator", "ChandeMO", false, "Oscillators", "Chande momentum: sum of rises minus falls over their total",
    [int("Length", 9), source()], (x) => ({ plots: [{ title: "ChandeMO", values: cmo(x.src(x.p.Source), x.p.Length), color: BLUE }], hlines: [zero] }), { precision: 2 }),
  study("tsi", "True Strength Index", "TSI", false, "Oscillators", "Double-smoothed momentum with a signal line",
    [int("Long length", 25), int("Short length", 13), int("Signal length", 13), source()], (x) => {
      const t = map(tsi(x.src(x.p.Source), x.p["Short length"], x.p["Long length"]), (v) => 100 * v);
      return { plots: [{ title: "True Strength Index", values: t, color: BLUE }, { title: "Signal", values: ema(t, x.p["Signal length"]), color: "#E91E63" }], hlines: [zero] };
    }, { precision: 2 }),
  study("ppo", "Price Oscillator", "PPO", false, "Oscillators", "Percentage difference between a short and a long moving average",
    [int("Short length", 10), int("Long length", 21), source(), bool("Exponential", false)], (x) => {
      const s = x.src(x.p.Source), f = x.p.Exponential ? ema : sma, a = f(s, x.p["Short length"]), b = f(s, x.p["Long length"]);
      return { plots: [{ title: "PPO", values: map2(a, b, (p, q) => ((p - q) / q) * 100), color: TEAL }], hlines: [zero] };
    }, { precision: 2 }),
  study("dpo", "Detrended Price Oscillator", "DPO", false, "Oscillators", "Close minus a lagged SMA, to show cycles without the trend", [int("Length", 21)], (x) => {
    const n = x.p.Length, back = Math.floor(n / 2) + 1, m = ago(sma(x.c, n), back);
    return { plots: [{ title: "Detrended Price Oscillator", values: map2(x.c, m, (c, v) => c - v), color: "#43A047" }], hlines: [zero] };
  }),
  study("kst", "Know Sure Thing", "KST", false, "Oscillators", "Weighted sum of four smoothed rates of change",
    [int("ROC length #1", 10), int("ROC length #2", 15), int("ROC length #3", 20), int("ROC length #4", 30),
     int("SMA length #1", 10), int("SMA length #2", 10), int("SMA length #3", 10), int("SMA length #4", 15), int("Signal line length", 9)], (x) => {
      const roc = (n: number) => map(x.c, (c, i) => (i >= n ? (100 * (c - x.c[i - n])) / x.c[i - n] : NaN));
      const part = (k: number) => sma(roc(x.p[`ROC length #${k}`]), x.p[`SMA length #${k}`]);
      const a = part(1), b = part(2), c = part(3), d = part(4), kst = map(a, (v, i) => v + 2 * b[i] + 3 * c[i] + 4 * d[i]);
      return { plots: [{ title: "KST", values: kst, color: TEAL }, { title: "Signal", values: sma(kst, x.p["Signal line length"]), color: RED }], hlines: [zero] };
    }, { precision: 4 }),
  study("coppock", "Coppock Curve", "Coppock", false, "Oscillators", "WMA of two rates of change, a long-term momentum gauge",
    [int("WMA length", 10), int("Long RoC length", 14), int("Short RoC length", 11), source()], (x) => {
      const s = x.src(x.p.Source), roc = (n: number) => map(s, (v, i) => (i >= n ? (100 * (v - s[i - n])) / s[i - n] : NaN));
      return { plots: [{ title: "Coppock Curve", values: wma(map2(roc(x.p["Long RoC length"]), roc(x.p["Short RoC length"]), (a, b) => a + b), x.p["WMA length"]), color: BLUE }], hlines: [zero] };
    }, { precision: 2 }),
  study("bbpower", "Bull Bear Power", "BBPower", false, "Oscillators", "High and low against an EMA: bull minus bear pressure", [int("Length", 13)], (x) => {
    const e = ema(x.c, x.p.Length);
    return { plots: [{ title: "BBPower", values: map(e, (m, i) => x.h[i] - m + (x.l[i] - m)), color: TEAL, style: "columns", colorUp: TEAL, colorDown: RED }] };
  }),
  study("bop", "Balance of Power", "BOP", false, "Oscillators", "Close minus open over the bar range, -1 to 1", [], (x) => ({
    plots: [{ title: "BOP", values: map(x.c, (c, i) => (x.h[i] - x.l[i] ? (c - x.o[i]) / (x.h[i] - x.l[i]) : 0)), color: "#FF5252" }], hlines: [zero],
  }), { precision: 2 }),
  study("hv", "Historical Volatility", "HV", false, "Oscillators", "Annualised standard deviation of log returns, in percent",
    [int("Length", 10, 2), int("Periods per year", 365)], (x) => {
      const lr = map(x.c, (c, i) => (i ? Math.log(c / x.c[i - 1]) : NaN));
      return { plots: [{ title: "HV", values: map(stdev(lr, x.p.Length), (v) => 100 * v * Math.sqrt(x.p["Periods per year"])), color: BLUE }] };
    }, { precision: 2 }),
  study("massindex", "Mass Index", "Mass", false, "Oscillators", "Sum of the EMA range ratio, flags reversals when the range widens", [int("Length", 10)], (x) => {
    const e1 = ema(map2(x.h, x.l, (h, l) => h - l), 9), e2 = ema(e1, 9);
    return { plots: [{ title: "Mass Index", values: sum(map2(e1, e2, (a, b) => a / b), x.p.Length), color: BLUE }] };
  }, { precision: 2 }),
  study("rvgi", "Relative Vigor Index", "RVGI", false, "Oscillators", "Close minus open against the range, with a signal", [int("Length", 10)], (x) => {
    const n = x.p.Length, num = swma(map2(x.c, x.o, (c, o) => c - o)), den = swma(map2(x.h, x.l, (h, l) => h - l));
    const r = map2(sum(num, n), sum(den, n), (a, b) => a / b);
    return { plots: [{ title: "RVGI", values: r, color: TEAL }, { title: "Signal", values: swma(r), color: RED }] };
  }, { precision: 4 }),
  study("accdist", "Accumulation/Distribution", "Accum/Dist", false, "Volume", "Running total of volume weighted by the close within the range", [],
    (x) => ({ plots: [{ title: "Accumulation/Distribution", values: accdist(x), color: "#999915" }] }), { format: "volume" }),
  study("chaikinosc", "Chaikin Oscillator", "Chaikin Osc", false, "Volume", "Fast minus slow EMA of accumulation/distribution",
    [int("Fast length", 3), int("Slow length", 10)], (x) => {
      const ad = accdist(x);
      return { plots: [{ title: "Chaikin Oscillator", values: map2(ema(ad, x.p["Fast length"]), ema(ad, x.p["Slow length"]), (a, b) => a - b), color: "#EC407A" }], hlines: [zero] };
    }, { format: "volume" }),
  study("eom", "Ease of Movement", "EOM", false, "Volume", "Price movement per unit of volume, smoothed", [int("Length", 14), int("Divisor", 10000)], (x) => {
    const d = change(hl2(x)), raw = map(d, (v, i) => { const r = (x.p.Divisor * v * (x.h[i] - x.l[i])) / x.v[i]; return Number.isFinite(r) ? r : NaN; });
    return { plots: [{ title: "EOM", values: sma(raw, x.p.Length), color: "#43A047" }], hlines: [zero] };
  }, { precision: 4 }),
  study("pvt", "Price Volume Trend", "PVT", false, "Volume", "Running total of volume weighted by the percent change", [], (x) => {
    let acc = 0;
    return { plots: [{ title: "PVT", values: map(x.c, (c, i) => { if (i && x.c[i - 1]) acc += ((c - x.c[i - 1]) / x.c[i - 1]) * x.v[i]; return acc; }), color: BLUE }] };
  }, { format: "volume" }),
  study("volosc", "Volume Oscillator", "Volume Osc", false, "Volume", "Short minus long volume EMA, in percent", [int("Short length", 5), int("Long length", 10)], (x) => {
    const a = ema(x.v, x.p["Short length"]), b = ema(x.v, x.p["Long length"]);
    return { plots: [{ title: "Volume Osc", values: map2(a, b, (p, q) => (q ? (100 * (p - q)) / q : NaN)), color: BLUE }], hlines: [zero] };
  }, { precision: 2, format: "percent" }),
  study("efi", "Elder Force Index", "EFI", false, "Volume", "EMA of the price change times volume", [int("Length", 13)], (x) => ({
    plots: [{ title: "Elder Force Index", values: ema(map(change(x.c), (d, i) => d * x.v[i]), x.p.Length), color: RED }], hlines: [zero],
  }), { format: "volume" }),
  study("netvolume", "Net Volume", "Net Vol", false, "Volume", "Bar volume signed by the close-to-close move", [], (x) => ({
    plots: [{ title: "Net Volume", values: map(change(x.c), (d, i) => (d > 0 ? x.v[i] : d < 0 ? -x.v[i] : 0)), color: TEAL, style: "columns", colorUp: TEAL, colorDown: RED }],
  }), { format: "volume" }),
];

function pivotLevels(x: Ctx): StudyOut {
  const kind: string = x.p.Type, weekly = x.p["Pivots timeframe"] === "1W", back: number = x.p["Number of pivots back"];
  const DAY = 86_400_000, len = weekly ? 7 * DAY : DAY, color = "#FB8C00";
  const bucket = (t: number) => (weekly ? Math.floor((t - 4 * DAY) / (7 * DAY)) : Math.floor(t / DAY));
  const startOf = (b: number) => (weekly ? b * 7 * DAY + 4 * DAY : b * DAY);
  const periods: { lines: DrawLine[]; labels: DrawLabel[] }[] = [];
  let cur = NaN, H = NaN, L = NaN, C = NaN, id = 0;
  for (let i = 0; i < x.c.length; i++) {
    const b = bucket(x.t[i]);
    if (b !== cur) {
      if (!Number.isNaN(cur)) {
        const t = startOf(b), r = H - L, O = x.o[i];
        const P = kind === "Woodie" ? (H + L + 2 * O) / 4 : (H + L + C) / 3;
        const lv: [string, number][] = kind === "Camarilla"
          ? [["P", P], ["R1", C + (1.1 * r) / 12], ["S1", C - (1.1 * r) / 12], ["R2", C + (1.1 * r) / 6], ["S2", C - (1.1 * r) / 6], ["R3", C + (1.1 * r) / 4], ["S3", C - (1.1 * r) / 4]]
          : kind === "Fibonacci"
          ? [["P", P], ["R1", P + 0.382 * r], ["S1", P - 0.382 * r], ["R2", P + 0.618 * r], ["S2", P - 0.618 * r], ["R3", P + r], ["S3", P - r]]
          : kind === "Classic"
          ? [["P", P], ["R1", 2 * P - L], ["S1", 2 * P - H], ["R2", P + r], ["S2", P - r], ["R3", P + 2 * r], ["S3", P - 2 * r]]
          : [["P", P], ["R1", 2 * P - L], ["S1", 2 * P - H], ["R2", P + r], ["S2", P - r], ["R3", H + 2 * (P - L)], ["S3", L - 2 * (H - P)]];
        periods.push({
          lines: lv.map(([, v]) => ({ id: ++id, x1: t, y1: v, x2: t + len, y2: v, color, width: 1, style: "solid", extend: "none" })),
          labels: x.p["Show labels"] ? lv.map(([n, v]) => ({ id: ++id, x: t, y: v, text: n, color: "rgba(0,0,0,0)", textColor: color, style: "right", size: "small" })) : [],
        });
        if (periods.length > back) periods.shift();
      }
      cur = b; H = x.h[i]; L = x.l[i];
    } else { H = Math.max(H, x.h[i]); L = Math.min(L, x.l[i]); }
    C = x.c[i];
  }
  return { plots: [], drawings: { lines: periods.flatMap((p) => p.lines), labels: periods.flatMap((p) => p.labels), boxes: [] } };
}

function zigzag(x: Ctx): StudyOut {
  const dev: number = x.p["Price deviation for reversals (%)"], labels: boolean = x.p["Show price labels"], color = BLUE;
  const out = empty();
  let id = 0, dir = 0, line: DrawLine | null = null, extT = NaN, extP = NaN, prev = NaN;
  for (let i = 0; i < x.c.length; i++) {
    const t = x.t[i], h = x.h[i], l = x.l[i];
    if (dir === 0) {
      dir = 1; extT = t; extP = h;
      line = { id: ++id, x1: t, y1: l, x2: t, y2: h, color, width: 2, style: "solid", extend: "none" };
      out.lines.push(line);
      continue;
    }
    if (dir === 1 ? h >= extP : l <= extP) { extT = t; extP = dir === 1 ? h : l; line!.x2 = extT; line!.y2 = extP; continue; }
    const back = dir === 1 ? l : h;
    if ((Math.abs(back - extP) / extP) * 100 < dev) continue;
    if (labels) {
      const pct = Number.isNaN(prev) ? NaN : ((extP - prev) / prev) * 100;
      out.labels.push({ id: ++id, x: extT, y: extP, text: Number.isNaN(pct) ? fmtPrice(extP) : `${fmtPrice(extP)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`,
                        color: "rgba(0,0,0,0)", textColor: color, style: dir === 1 ? "down" : "up", size: "small" });
    }
    prev = extP;
    line = { id: ++id, x1: extT, y1: extP, x2: t, y2: back, color, width: 2, style: "solid", extend: "none" };
    out.lines.push(line);
    dir = -dir; extT = t; extP = back;
  }
  return { plots: [], drawings: out };
}

function regressionChannel(x: Ctx): StudyOut {
  const n: number = x.p.Length, s = x.src(x.p.Source), last = s.length - 1;
  if (last + 1 < n) return { plots: [], drawings: empty() };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let k = 0; k < n; k++) { const xx = n - 1 - k, y = s[last - k]; sx += xx; sy += y; sxx += xx * xx; sxy += xx * y; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
  let ss = 0;
  for (let k = 0; k < n; k++) { const r = s[last - k] - (icpt + slope * (n - 1 - k)); ss += r * r; }
  const dev = x.p.Deviation * Math.sqrt(ss / n), x1 = x.t[last - n + 1], x2 = x.t[last], y1 = icpt, y2 = icpt + slope * (n - 1);
  const extend = x.p["Extend right"] ? "right" : "none";
  const ln = (id: number, d: number, c: string, st: string): DrawLine => ({ id, x1, y1: y1 + d, x2, y2: y2 + d, color: c, width: 1, style: st, extend });
  return { plots: [], drawings: { lines: [ln(1, 0, RED, "dashed"), ln(2, dev, BLUE, "solid"), ln(3, -dev, BLUE, "solid")], labels: [], boxes: [] } };
}

