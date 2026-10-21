import type { DrawLabel, InputDef, ProfileSpec } from "../indicators/types";
import { change, ema, highest, lowest, map, map2, rma, rsi, sma, stdev, sum, trueRange, type Arr } from "./math";
import { BLUE, GREY, ORANGE, RED, TEAL, band, float, int, levels, source, type Ctx, type Study, type StudyOut } from "./studies";
import { ago, linreg, pivot, tsi } from "./more";

const zero = { value: 0, color: GREY, style: "dotted" };
const nz = (v: number) => (Number.isNaN(v) ? 0 : v);
const hlc3 = (x: Ctx) => map(x.c, (c, i) => (x.h[i] + x.l[i] + c) / 3);
const hl2 = (x: Ctx) => map2(x.h, x.l, (h, l) => (h + l) / 2);

function cci(s: Arr, n: number): Arr {
  const m = sma(s, n);
  return map(s, (v, i) => {
    if (Number.isNaN(m[i])) return NaN;
    let d = 0;
    for (let k = 0; k < n; k++) d += Math.abs(s[i - k] - m[i]);
    return d > 0 ? (v - m[i]) / (0.015 * (d / n)) : NaN;
  });
}

function percentRank(s: Arr, n: number): Arr {
  return map(s, (v, i) => {
    if (i < n || Number.isNaN(v)) return NaN;
    let c = 0;
    for (let k = 1; k <= n; k++) { const o = s[i - k]; if (Number.isNaN(o)) return NaN; if (o <= v) c++; }
    return (100 * c) / n;
  });
}

function correlation(a: Arr, b: Arr, n: number): Arr {
  return map(a, (_, i) => {
    if (i < n - 1) return NaN;
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let k = 0; k < n; k++) { const x = a[i - k], y = b[i - k]; if (Number.isNaN(x) || Number.isNaN(y)) return NaN; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y; }
    const cov = sab / n - (sa / n) * (sb / n), va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
    return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : NaN;
  });
}

const fmtPrice = (p: number) => { const d = p > 0 ? Math.max(2, 4 - Math.floor(Math.log10(p))) : 2; return String(Math.round(p * 10 ** d) / 10 ** d); };

function study(id: string, name: string, shortTitle: string, overlay: boolean, category: string, description: string,
               inputs: InputDef[], run: (x: Ctx) => StudyOut, extra: { precision?: number; format?: "price" | "percent" | "volume" } = {}): Study {
  return { id, name, shortTitle, overlay, category, description, inputs, config: { shortTitle, overlay, ...extra }, run };
}

function autoFib(x: Ctx, kind: "retracement" | "extension"): StudyOut {
  const atr = rma(trueRange(x.h, x.l, x.c), 10), mult = x.p["Deviation (x ATR %)"];
  const pivots: { t: number; p: number }[] = [];
  let dir = 0, extT = NaN, extP = NaN;
  for (let i = 0; i < x.c.length; i++) {
    const h = x.h[i], l = x.l[i], dev = (mult * atr[i] * 100) / x.c[i];
    if (dir === 0) { if (!Number.isNaN(dev)) { dir = 1; extT = x.t[i]; extP = h; pivots.push({ t: x.t[i], p: l }); } continue; }
    if (dir === 1 ? h >= extP : l <= extP) { extT = x.t[i]; extP = dir === 1 ? h : l; continue; }
    const back = dir === 1 ? l : h;
    if (!Number.isNaN(dev) && (Math.abs(back - extP) / extP) * 100 >= dev) { pivots.push({ t: extT, p: extP }); dir = -dir; extT = x.t[i]; extP = back; }
  }
  const last = x.t[x.t.length - 1], extend = x.p["Extend right"] ? "right" : "none";
  let x1: number, levels: [number, string][], priceOf: (v: number) => number;
  if (kind === "retracement") {
    const a = pivots[pivots.length - 1];
    if (!a || extT === a.t) return { plots: [], drawings: { lines: [], labels: [], boxes: [] } };
    const [from, to] = x.p.Reverse ? [extP, a.p] : [a.p, extP];
    x1 = a.t; priceOf = (v) => to + (from - to) * v;
    levels = [[0, GREY], [0.236, RED], [0.382, "#81C784"], [0.5, "#4CAF50"], [0.618, "#009688"], [0.786, "#64B5F6"], [1, GREY]];
  } else {
    if (pivots.length < 2) return { plots: [], drawings: { lines: [], labels: [], boxes: [] } };
    const a = pivots[pivots.length - 2], b = pivots[pivots.length - 1];
    x1 = extT; priceOf = (v) => extP + (b.p - a.p) * v;
    levels = [[0, GREY], [0.382, RED], [0.618, "#009688"], [1, GREY], [1.272, "#81C784"], [1.618, BLUE], [2.618, "#9C27B0"]];
  }
  let id = 0;
  const lines = levels.map(([v, color]) => ({ id: ++id, x1, y1: priceOf(v), x2: last, y2: priceOf(v), color, width: 1, style: "solid", extend }));
  const labels = levels.flatMap(([v, color]) => {
    const text = [x.p.Levels ? String(v) : "", x.p.Prices ? `(${fmtPrice(priceOf(v))})` : ""].filter(Boolean).join(" ");
    return text ? [{ id: ++id, x: x1, y: priceOf(v), text, color: "rgba(0,0,0,0)", textColor: color, style: "right", size: "small" }] : [];
  });
  return { plots: [], drawings: { lines, labels, boxes: [] } };
}
const fibInputs: InputDef[] = [float("Deviation (x ATR %)", 3, 0.5, 0.1), { name: "Extend right", type: "bool", default: true },
  { name: "Prices", type: "bool", default: true }, { name: "Levels", type: "bool", default: true }];

type Candle = ReturnType<typeof candleAt>;
function candleAt(x: Ctx, i: number, avg: Arr, ma: Arr, trend: boolean) {
  const O = x.o[i], H = x.h[i], L = x.l[i], C = x.c[i], Bh = Math.max(O, C), Bl = Math.min(O, C), B = Bh - Bl, up = H - Bh, dn = Bl - L, range = H - L;
  return {
    O, H, L, C, Bh, Bl, B, avg: avg[i], up, dn, range, mid: B / 2 + Bl, white: O < C, black: O > C, small: B < avg[i], long: B > avg[i],
    hasUp: up > 0.05 * B, hasDn: dn > 0.05 * B, hl2: (H + L) / 2, upTrend: !trend || C > ma[i], downTrend: !trend || C < ma[i], doji: range > 0 && B <= range * 0.05,
  };
}
const PATTERNS: [string, string, "bull" | "bear" | "neutral", (b: Candle, p: Candle, q: Candle) => boolean][] = [
    ["Hammer", "H", "bull", (b, p, q) => b.small && b.B > 0 && b.Bl > b.hl2 && b.dn >= 2 * b.B && !b.hasUp && b.downTrend],
    ["Inverted Hammer", "IH", "bull", (b, p, q) => b.small && b.B > 0 && b.Bh < b.hl2 && b.up >= 2 * b.B && !b.hasDn && b.downTrend],
    ["Bullish Engulfing", "BE", "bull", (b, p, q) => b.downTrend && b.white && b.long && p.black && p.small && b.C >= p.O && b.O <= p.C && (b.C > p.O || b.O < p.C)],
    ["Bullish Harami", "BH", "bull", (b, p, q) => p.long && p.black && p.downTrend && b.white && b.small && b.H <= p.Bh && b.L >= p.Bl],
    ["Piercing Line", "P", "bull", (b, p, q) => p.downTrend && p.black && p.long && b.white && b.O <= p.L && b.C > p.mid && b.C < p.O],
    ["Morning Star", "MS", "bull", (b, p, q) => q.long && p.small && b.long && b.downTrend && q.black && p.Bh < q.Bl && b.white && b.Bh >= q.mid && b.Bh < q.Bh && p.Bh < b.Bl],
    ["Three White Soldiers", "3WS", "bull", (b, p, q) => [b, p, q].every((x) => x.white && x.long && x.range * 0.05 > x.up) && b.C > p.C && p.C > q.C && b.O < p.C && b.O > p.O && p.O < q.C && p.O > q.O],
    ["Tweezer Bottom", "TB", "bull", (b, p, q) => p.downTrend && (!b.doji || (b.hasUp && b.hasDn)) && Math.abs(b.L - p.L) <= b.avg * 0.05 && p.black && b.white && p.long],
    ["White Marubozu", "MW", "bull", (b, p, q) => b.white && b.long && b.up <= 0.05 * b.B && b.dn <= 0.05 * b.B],
    ["Hanging Man", "HM", "bear", (b, p, q) => b.small && b.B > 0 && b.Bl > b.hl2 && b.dn >= 2 * b.B && !b.hasUp && b.upTrend],
    ["Shooting Star", "SS", "bear", (b, p, q) => b.small && b.B > 0 && b.Bh < b.hl2 && b.up >= 2 * b.B && !b.hasDn && b.upTrend],
    ["Bearish Engulfing", "BE", "bear", (b, p, q) => b.upTrend && b.black && b.long && p.white && p.small && b.C <= p.O && b.O >= p.C && (b.C < p.O || b.O > p.C)],
    ["Bearish Harami", "BH", "bear", (b, p, q) => p.long && p.white && p.upTrend && b.black && b.small && b.H <= p.Bh && b.L >= p.Bl],
    ["Dark Cloud Cover", "DCC", "bear", (b, p, q) => p.upTrend && p.white && p.long && b.black && b.O >= p.H && b.C < p.mid && b.C > p.O],
    ["Evening Star", "ES", "bear", (b, p, q) => q.long && p.small && b.long && b.upTrend && q.white && p.Bl > q.Bh && b.black && b.Bl <= q.mid && b.Bl > q.Bl && p.Bl > b.Bh],
    ["Three Black Crows", "3BC", "bear", (b, p, q) => [b, p, q].every((x) => x.black && x.long && x.range * 0.05 > x.dn) && b.C < p.C && p.C < q.C && b.O > p.C && b.O < p.O && p.O > q.C && p.O < q.O],
    ["Tweezer Top", "TT", "bear", (b, p, q) => p.upTrend && (!b.doji || (b.hasUp && b.hasDn)) && Math.abs(b.H - p.H) <= b.avg * 0.05 && p.white && b.black && p.long],
    ["Black Marubozu", "MB", "bear", (b, p, q) => b.black && b.long && b.up <= 0.05 * b.B && b.dn <= 0.05 * b.B],
    ["Doji", "D", "neutral", (b, p, q) => b.doji && (b.up === b.dn || (Math.abs(b.up - b.dn) / b.dn < 1 && Math.abs(b.dn - b.up) / b.up < 1))],
];
function candlePatterns(x: Ctx): StudyOut {
  const body = map(x.c, (c, i) => Math.abs(c - x.o[i])), avg = ema(body, 14), ma = sma(x.c, 50), trend = x.p["Detect trend based on"] === "SMA50";
  const bars = Array.from({ length: x.c.length }, (_, i) => candleAt(x, i, avg, ma, trend));
  const shapes = PATTERNS.filter(([name]) => x.p[name]).map(([, , kind, test]) => {
    const cond = map(x.c, (_, i) => (i >= 2 && test(bars[i], bars[i - 1], bars[i - 2]) ? 1 : 0));
    return kind === "bull" ? { cond, shape: "arrowUp", location: "belowBar", color: TEAL }
      : kind === "bear" ? { cond, shape: "arrowDown", location: "aboveBar", color: RED } : { cond, shape: "circle", location: "aboveBar", color: GREY };
  });
  return { plots: [], shapes: shapes.map((s, k) => ({ ...s, text: x.p["Show labels"] ? PATTERNS.filter(([n]) => x.p[n])[k][1] : undefined })) };
}

const profileInputs = (width: number, label: string, placement: "right" | "left"): InputDef[] => [
  int("Row size", 24, 1, 500), int("Value area volume (%)", 70, 0, 100), { name: "Placement", type: "select", default: placement, options: ["right", "left"] },
  { name: "Show POC", type: "bool", default: true }, int(label, width, 1, 100),
  { name: "Up volume", type: "color", default: "rgba(41,98,255,0.3)", group: "Style" }, { name: "Down volume", type: "color", default: "rgba(251,192,45,0.3)", group: "Style" },
  { name: "Value area up", type: "color", default: "rgba(41,98,255,0.65)", group: "Style" }, { name: "Value area down", type: "color", default: "rgba(251,192,45,0.65)", group: "Style" },
  { name: "POC color", type: "color", default: "#FF5252", group: "Style" },
];
const profile = (x: Ctx, range: "visible" | "session", width: string): ProfileSpec => ({
  title: "Volume Profile", range, session: x.p.Session ?? "day", rows: x.p["Row size"], valueArea: x.p["Value area volume (%)"], widthPercent: x.p[width],
  placement: x.p.Placement, showPoc: x.p["Show POC"], upColor: x.p["Up volume"], downColor: x.p["Down volume"],
  vaUpColor: x.p["Value area up"], vaDownColor: x.p["Value area down"], pocColor: x.p["POC color"],
});

export const EXTRA_STUDIES: Study[] = [
  study("candlepatterns", "Candlestick Patterns", "Patterns", true, "Trend", "Marks 19 candlestick patterns: hammers, engulfing, harami, stars, soldiers, tweezers, doji",
    [{ name: "Detect trend based on", type: "select", default: "SMA50", options: ["SMA50", "No detection"] }, { name: "Show labels", type: "bool", default: true },
     ...PATTERNS.map(([name]): InputDef => ({ name, type: "bool", default: true, group: "Patterns" }))], candlePatterns),
  study("autofib", "Auto Fib Retracement", "Auto Fib", true, "Support & resistance", "Fib retracement drawn automatically over the latest swing",
    [...fibInputs, { name: "Reverse", type: "bool", default: false }], (x) => autoFib(x, "retracement")),
  study("autofibext", "Auto Fib Extension", "Auto Fib Ext", true, "Support & resistance", "Trend-based fib extension from the last two swings",
    fibInputs, (x) => autoFib(x, "extension")),
  study("vrvp", "Visible Range Volume Profile", "VRVP", true, "Volume", "Volume at each price over the bars on screen, with value area and POC",
    profileInputs(30, "Width (% of chart)", "right"), (x) => ({ plots: [], profiles: [profile(x, "visible", "Width (% of chart)")] })),
  study("svp", "Session Volume Profile", "SVP", true, "Volume", "A volume profile for every day or week, with value area and POC",
    [{ name: "Session", type: "select", default: "day", options: ["day", "week"] }, ...profileInputs(70, "Width (% of session)", "left")],
    (x) => ({ plots: [], profiles: [profile(x, "session", "Width (% of session)")] })),
  study("mcginley", "McGinley Dynamic", "McGinley", true, "Moving averages", "Moving average that speeds up and slows down with the market",
    [int("Length", 14), source()], (x) => {
      const s = x.src(x.p.Source), n = x.p.Length, e = ema(s, n);
      let mg = NaN;
      return { plots: [{ title: "McGinley", values: map(s, (v, i) => (mg = Number.isNaN(mg) ? e[i] : mg + (v - mg) / (n * (v / mg) ** 4))), color: BLUE }] };
    }),
  study("gmma", "Guppy Multiple Moving Average", "GMMA", true, "Moving averages", "Six short and six long EMAs: trader and investor groups", [source()], (x) => {
    const s = x.src(x.p.Source);
    return { plots: [...[3, 5, 8, 10, 12, 15].map((n) => ({ title: `Short ${n}`, values: ema(s, n), color: "#00BCD4" })),
                     ...[30, 35, 40, 45, 50, 60].map((n) => ({ title: `Long ${n}`, values: ema(s, n), color: RED }))] };
  }),
  study("machannel", "Moving Average Channel", "MAC", true, "Bands & channels", "SMA of the highs and SMA of the lows as a channel",
    [int("Upper length", 20), int("Lower length", 20), int("Upper offset", 0, -500, 500), int("Lower offset", 0, -500, 500)], (x) => {
      const upper = sma(x.h, x.p["Upper length"]), lower = sma(x.l, x.p["Lower length"]);
      return { plots: [{ title: "Upper", values: upper, color: BLUE, offset: x.p["Upper offset"] }, { title: "Lower", values: lower, color: ORANGE, offset: x.p["Lower offset"] }],
               bands: [{ title: "Background", upper, lower, color: "rgba(33,150,243,0.05)" }] };
    }),
  study("stderrbands", "Standard Error Bands", "SEB", true, "Bands & channels", "Regression line with standard-error bands, smoothed",
    [int("Length", 21, 3), int("Smoothing", 3), float("Standard errors", 2), source()], (x) => {
      const s = x.src(x.p.Source), n = x.p.Length, k = x.p["Standard errors"], lr = linreg(s, n, 0);
      const se = map(s, (_, i) => {
        if (i < n - 1) return NaN;
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (let j = 0; j < n; j++) { const xx = n - 1 - j, y = s[i - j]; sx += xx; sy += y; sxx += xx * xx; sxy += xx * y; }
        const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
        let ss = 0;
        for (let j = 0; j < n; j++) ss += (s[i - j] - (icpt + slope * (n - 1 - j))) ** 2;
        return Math.sqrt(ss / (n - 2));
      });
      const m = x.p.Smoothing, upper = sma(map2(lr, se, (l, e) => l + k * e), m), lower = sma(map2(lr, se, (l, e) => l - k * e), m);
      return { plots: [{ title: "Middle", values: sma(lr, m), color: BLUE }, { title: "Upper", values: upper, color: RED }, { title: "Lower", values: lower, color: TEAL }],
               bands: [{ title: "Background", upper, lower, color: "rgba(33,150,243,0.05)" }] };
    }),
  study("ckstop", "Chande Kroll Stop", "CKS", true, "Trend", "Stops from the N-bar extreme minus ATR, for longs and shorts",
    [int("ATR length", 10), float("ATR coefficient", 1), int("Stop length", 9)], (x) => {
      const p = x.p["ATR length"], k = x.p["ATR coefficient"], q = x.p["Stop length"], atr = rma(trueRange(x.h, x.l, x.c), p);
      const hs = map2(highest(x.h, p), atr, (h, a) => h - k * a), ls = map2(lowest(x.l, p), atr, (l, a) => l + k * a);
      return { plots: [{ title: "Stop Short", values: highest(hs, q), color: ORANGE }, { title: "Stop Long", values: lowest(ls, q), color: BLUE }] };
    }),
  study("volstop", "Volatility Stop", "VStop", true, "Trend", "ATR trailing stop that flips with the close",
    [int("Length", 20, 2), float("Multiplier", 2, 0.25, 0.25), source()], (x) => {
      const s = x.src(x.p.Source), tr = trueRange(x.h, x.l, x.c), atr = rma(tr, x.p.Length), f = x.p.Multiplier;
      const out = new Float64Array(s.length), colors = new Float64Array(s.length);
      let max = NaN, min = NaN, up = 1, stop = 0;
      for (let i = 0; i < s.length; i++) {
        const v = s[i], m = Number.isNaN(atr[i]) ? tr[i] : atr[i] * f;
        if (Number.isNaN(max)) { max = v; min = v; }
        max = Math.max(max, v); min = Math.min(min, v);
        let st = up ? Math.max(stop, max - m) : Math.min(stop, min + m);
        if (Number.isNaN(st)) st = v;
        const nu = v - st >= 0 ? 1 : 0;
        if (nu !== up) { max = v; min = v; st = nu ? v - m : v + m; }
        up = nu; stop = st; out[i] = st; colors[i] = v - st >= 0 ? 0 : 1;
      }
      return { plots: [{ title: "VStop", values: out, color: TEAL, style: "cross", palette: [TEAL, RED], colors }] };
    }),
  study("trendstrength", "Trend Strength Index", "Trend Strength", false, "Trend", "Correlation of price with time, -1 to 1", [int("Length", 14, 2)],
    (x) => ({ plots: [{ title: "Trend Strength", values: correlation(x.c, map(x.c, (_, i) => i), x.p.Length), color: BLUE }], hlines: [zero] }), { precision: 2 }),
  study("chopzone", "Chop Zone", "Chop Zone", false, "Trend", "EMA slope as coloured columns, from trending to choppy", [], (x) => {
    const avg = hlc3(x), hh = highest(x.h, 30), ll = lowest(x.l, 30), e = ema(x.c, 34);
    const zone = map(avg, (a, i) => {
      const span = (25 / (hh[i] - ll[i])) * ll[i], y2 = i ? ((e[i - 1] - e[i]) / a) * span : NaN, c = Math.sqrt(1 + y2 * y2);
      const r = Math.round((180 * Math.acos(1 / c)) / Math.PI), angle = y2 > 0 ? -r : r;
      if (Number.isNaN(angle)) return NaN;
      return angle >= 5 ? 0 : angle >= 3.57 ? 1 : angle >= 2.14 ? 2 : angle > 0.71 ? 3 : angle <= -5 ? 4 : angle <= -3.57 ? 5 : angle <= -2.14 ? 6 : angle <= -0.71 ? 7 : 8;
    });
    return { plots: [{ title: "Chop Zone", values: map(x.c, () => 1), color: "#FDD835", style: "columns",
                       palette: ["#26C6DA", "#43A047", "#A5D6A7", "#009688", "#D50000", "#E91E63", "#FF6D00", "#FFB74D", "#FDD835"], colors: zone }] };
  }),
  study("pivotshl", "Pivot Points High Low", "Pivots HL", true, "Support & resistance", "Labels at swing highs and lows confirmed N bars later",
    [int("Pivot high left", 10), int("Pivot high right", 10), int("Pivot low left", 10), int("Pivot low right", 10)], (x) => {
      const hr = x.p["Pivot high right"], lr = x.p["Pivot low right"];
      const ph = pivot(x.h, x.p["Pivot high left"], hr, true), pl = pivot(x.l, x.p["Pivot low left"], lr, false), labels: DrawLabel[] = [];
      let id = 0;
      for (let i = 0; i < x.c.length; i++) {
        if (!Number.isNaN(ph[i])) labels.push({ id: ++id, x: x.t[i - hr], y: ph[i], text: fmtPrice(ph[i]), color: TEAL, textColor: "#ffffff", style: "down", size: "small" });
        if (!Number.isNaN(pl[i])) labels.push({ id: ++id, x: x.t[i - lr], y: pl[i], text: fmtPrice(pl[i]), color: RED, textColor: "#ffffff", style: "up", size: "small" });
      }
      return { plots: [], drawings: { lines: [], labels, boxes: [] } };
    }),
  study("highlow52", "52 Week High/Low", "52W H/L", true, "Support & resistance", "Highest high and lowest low of the last 52 weeks", [], (x) => {
    const WEEK = 7 * 86_400_000, wk = (t: number) => Math.floor((t - 4 * 86_400_000) / WEEK);
    const hi = new Float64Array(x.c.length), lo = new Float64Array(x.c.length), weeks: { k: number; h: number; l: number }[] = [];
    for (let i = 0; i < x.c.length; i++) {
      const k = wk(x.t[i]), last = weeks[weeks.length - 1];
      if (!last || last.k !== k) weeks.push({ k, h: x.h[i], l: x.l[i] }); else { last.h = Math.max(last.h, x.h[i]); last.l = Math.min(last.l, x.l[i]); }
      const win = weeks.slice(-52);
      hi[i] = Math.max(...win.map((w) => w.h)); lo[i] = Math.min(...win.map((w) => w.l));
    }
    return { plots: [{ title: "52W High", values: hi, color: TEAL, style: "step" }, { title: "52W Low", values: lo, color: RED, style: "step" }] };
  }),
  study("fisher", "Fisher Transform", "Fisher", false, "Oscillators", "Gaussian transform of price within its range, with a trigger line", [int("Length", 9)], (x) => {
    const m = hl2(x), hh = highest(m, x.p.Length), ll = lowest(m, x.p.Length), fish = new Float64Array(m.length);
    let v = NaN, f = NaN;
    for (let i = 0; i < m.length; i++) {
      const raw = 0.66 * ((m[i] - ll[i]) / (hh[i] - ll[i]) - 0.5) + 0.67 * nz(v);
      v = Number.isFinite(raw) ? Math.max(-0.999, Math.min(0.999, raw)) : NaN;
      f = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * nz(f);
      fish[i] = f;
    }
    return { plots: [{ title: "Fisher", values: fish, color: BLUE }, { title: "Trigger", values: ago(fish, 1), color: ORANGE }],
             hlines: [1.5, 0.75, 0, -0.75, -1.5].map((value) => ({ value, color: Math.abs(value) === 0.75 ? GREY : "#E91E63", style: "dashed" })) };
  }, { precision: 2 }),
  study("connorsrsi", "Connors RSI", "CRSI", false, "Oscillators", "Average of a short RSI, a streak RSI and a 100-bar percent rank",
    [source(), int("RSI length", 3), int("UpDown length", 2), int("ROC length", 100)], (x) => {
      const s = x.src(x.p.Source), d = change(s);
      let u = 0;
      const streak = map(d, (v) => (u = v === 0 ? 0 : v > 0 ? (u <= 0 ? 1 : u + 1) : u >= 0 ? -1 : u - 1));
      const a = rsi(s, x.p["RSI length"]), b = rsi(streak, x.p["UpDown length"]), c = percentRank(map(s, (v, i) => (i ? (100 * (v - s[i - 1])) / s[i - 1] : NaN)), x.p["ROC length"]);
      return { plots: [{ title: "CRSI", values: map(a, (v, i) => (v + b[i] + c[i]) / 3), color: BLUE }], hlines: levels(70, 30), bands: [band(70, 30)] };
    }, { precision: 2 }),
  study("smii", "SMI Ergodic Indicator", "SMII", false, "Oscillators", "True strength index on fast settings with a signal line",
    [int("Long length", 20), int("Short length", 5), int("Signal line length", 5)], (x) => {
      const erg = tsi(x.c, x.p["Short length"], x.p["Long length"]);
      return { plots: [{ title: "SMI", values: erg, color: BLUE }, { title: "Signal", values: ema(erg, x.p["Signal line length"]), color: ORANGE }], hlines: [zero] };
    }, { precision: 4 }),
  study("smio", "SMI Ergodic Oscillator", "SMIO", false, "Oscillators", "SMI Ergodic minus its signal, as a histogram",
    [int("Long length", 20), int("Short length", 5), int("Signal line length", 5)], (x) => {
      const erg = tsi(x.c, x.p["Short length"], x.p["Long length"]);
      return { plots: [{ title: "SMI Ergodic Oscillator", values: map2(erg, ema(erg, x.p["Signal line length"]), (a, b) => a - b), color: "#26A69A", style: "columns", colorUp: "#26A69A", colorDown: "#FF5252" }] };
    }, { precision: 4 }),
  study("rvi", "Relative Volatility Index", "RVI", false, "Oscillators", "RSI computed on standard deviation instead of price change",
    [int("Length", 10), int("EMA length", 14), source()], (x) => {
      const s = x.src(x.p.Source), sd = stdev(s, x.p.Length), d = change(s), n = x.p["EMA length"];
      const up = ema(map2(d, sd, (v, e) => (v <= 0 ? 0 : e)), n), dn = ema(map2(d, sd, (v, e) => (v > 0 ? 0 : e)), n);
      return { plots: [{ title: "RVI", values: map2(up, dn, (a, b) => (a / (a + b)) * 100), color: "#7E57C2" }], hlines: levels(80, 20, 50), bands: [band(80, 20)] };
    }, { precision: 2 }),
  study("woodiescci", "Woodies CCI", "Woodies CCI", false, "Oscillators", "CCI 14 histogram with a fast turbo CCI",
    [int("CCI Turbo length", 6, 3, 14), int("CCI 14 length", 14, 7, 20)], (x) => {
      const t = hlc3(x), turbo = cci(t, x.p["CCI Turbo length"]), c = cci(t, x.p["CCI 14 length"]);
      const all = (i: number, sign: number) => { for (let k = 0; k < 6; k++) if (!(sign * c[i - k] > 0)) return false; return true; };
      return {
        plots: [{ title: "CCI Turbo Histogram", values: c, color: GREY, style: "histogram", palette: ["#26A69A", "#EF5350", GREY], colors: map(c, (_, i) => (all(i, 1) ? 0 : all(i, -1) ? 1 : 2)) },
                { title: "CCI Turbo", values: turbo, color: BLUE }, { title: "CCI 14", values: c, color: ORANGE }],
        hlines: [{ value: 0, color: GREY, style: "solid" }, { value: 100, color: GREY, style: "dashed" }, { value: -100, color: GREY, style: "dashed" },
                 { value: 200, color: GREY, style: "dotted" }, { value: -200, color: GREY, style: "dotted" }],
      };
    }, { precision: 2 }),
  study("ac", "Accelerator Oscillator", "AC", false, "Oscillators", "Awesome Oscillator minus its 5-bar SMA, coloured by direction", [], (x) => {
    const m = hl2(x), ao = map2(sma(m, 5), sma(m, 34), (a, b) => a - b), ac = map2(ao, sma(ao, 5), (a, b) => a - b), d = change(ac);
    return { plots: [{ title: "AC", values: ac, color: TEAL, style: "columns", palette: [TEAL, RED], colors: map(d, (v) => (Number.isNaN(v) ? NaN : v >= 0 ? 0 : 1)) }] };
  }),
  study("rci", "Rank Correlation Index", "RCI", false, "Oscillators", "Spearman rank correlation of price and time, -100 to 100", [int("Length", 10, 2, 500), source()], (x) => {
    const s = x.src(x.p.Source), n = x.p.Length;
    const out = map(s, (_, i) => {
      if (i < n - 1) return NaN;
      let d2 = 0;
      for (let k = 0; k < n; k++) {
        let above = 0, same = 0;
        for (let j = 0; j < n; j++) { if (s[i - j] > s[i - k]) above++; else if (s[i - j] === s[i - k]) same++; }
        d2 += (k + 1 - (above + (same + 1) / 2)) ** 2;
      }
      return (1 - (6 * d2) / (n * (n * n - 1))) * 100;
    });
    return { plots: [{ title: "RCI", values: out, color: BLUE }], hlines: levels(80, -80, 0), bands: [band(80, -80)] };
  }, { precision: 2 }),
  study("ulcer", "Ulcer Index", "Ulcer", false, "Oscillators", "Depth and duration of drawdowns from the N-bar high", [int("Length", 14), source()], (x) => {
    const s = x.src(x.p.Source), n = x.p.Length, hh = highest(s, n);
    return { plots: [{ title: "Ulcer Index", values: map(sma(map(s, (v, i) => ((100 * (v - hh[i])) / hh[i]) ** 2), n), Math.sqrt), color: BLUE }] };
  }, { precision: 2 }),
  study("stddev", "Standard Deviation", "StdDev", false, "Oscillators", "Standard deviation of the source over N bars", [int("Length", 20), source()],
    (x) => ({ plots: [{ title: "StdDev", values: stdev(x.src(x.p.Source), x.p.Length), color: BLUE }] })),
  study("lrslope", "Linear Regression Slope", "LRS", false, "Oscillators", "Bar-to-bar change of the least-squares line", [int("Length", 14, 2), source()], (x) => {
    const s = x.src(x.p.Source), n = x.p.Length;
    return { plots: [{ title: "Slope", values: map2(linreg(s, n, 0), linreg(s, n, 1), (a, b) => a - b), color: BLUE }], hlines: [zero] };
  }, { precision: 6 }),
  study("adr", "Average Day Range", "ADR", false, "Oscillators", "Average high-to-low range over N bars", [int("Length", 14)],
    (x) => ({ plots: [{ title: "ADR", values: sma(map2(x.h, x.l, (h, l) => h - l), x.p.Length), color: BLUE }] })),
  study("majority", "Majority Rule", "MR", false, "Oscillators", "Share of bars that closed up over the last N, in percent", [int("Length", 10)], (x) => {
    const n = x.p.Length, up = map(change(x.c), (d) => (d > 0 ? 1 : Number.isNaN(d) ? NaN : 0));
    return { plots: [{ title: "Majority Rule", values: map(sum(up, n), (v) => (v / n) * 100), color: BLUE }], hlines: [{ value: 50, color: GREY, style: "dashed" }] };
  }, { precision: 2 }),
  study("klinger", "Klinger Oscillator", "KVO", false, "Volume", "EMA difference of volume signed by the typical price", [int("Signal length", 13)], (x) => {
    const sv = map(change(hlc3(x)), (d, i) => (d >= 0 ? x.v[i] : -x.v[i])), kvo = map2(ema(sv, 34), ema(sv, 55), (a, b) => a - b);
    return { plots: [{ title: "Klinger Oscillator", values: kvo, color: BLUE }, { title: "Signal", values: ema(kvo, x.p["Signal length"]), color: "#43A047" }], hlines: [zero] };
  }, { format: "volume" }),
];
