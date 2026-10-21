import assert from "node:assert/strict";
import { BASIC_STUDIES, basicEngine, computeStudy } from "../src/basic/index";
import type { Bar, EngineOut } from "../src/types";

function rnd(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function series(n: number, seed = 3): Bar[] {
  const r = rnd(seed), out: Bar[] = [];
  let p = 250;
  for (let i = 0; i < n; i++) {
    const c = p * (1 + (r() - 0.5) * 0.03), h = Math.max(p, c) * (1 + r() * 0.01), l = Math.min(p, c) * (1 - r() * 0.01);
    out.push({ time: 1_760_000_000_000 + i * 3_600_000, open: p, high: h, low: l, close: c, volume: 100 + r() * 900, closed: true });
    p = c;
  }
  return out;
}

const bars = series(600);
const close = bars.map((b) => b.close), high = bars.map((b) => b.high), low = bars.map((b) => b.low), vol = bars.map((b) => b.volume!);
const values = (id: string, title: string, params = {}) => Array.from(computeStudy(id, bars, params).plots.find((p) => p.title === title)!.values);
const near = (a: number[], b: number[], what: string) => {
  assert.equal(a.length, b.length, `${what}: length`);
  a.forEach((x, i) => {
    if (Number.isNaN(x) || Number.isNaN(b[i])) assert.ok(Number.isNaN(x) && Number.isNaN(b[i]), `${what}: NaN at ${i}`);
    else assert.ok(Math.abs(x - b[i]) <= 1e-9 * Math.max(1, Math.abs(x)), `${what}: ${x} vs ${b[i]} at ${i}`);
  });
};
const ok = (name: string, fn: () => void) => { fn(); console.log(`ok  ${name}`); };

const refSma = (x: number[], n: number) => x.map((_, i) => (i < n - 1 ? NaN : x.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n));
const refWma = (x: number[], n: number) => x.map((_, i) => {
  if (i < n - 1 || x.slice(i - n + 1, i + 1).some(Number.isNaN)) return NaN;
  let num = 0;
  for (let k = 0; k < n; k++) num += x[i - k] * (n - k);
  return num / ((n * (n + 1)) / 2);
});
const refRma = (x: number[], n: number) => {
  const out = x.map(() => NaN);
  let e = NaN;
  for (let i = 1; i < x.length; i++) {
    if (i === n) e = x.slice(1, n + 1).reduce((s, v) => s + v, 0) / n;
    else if (i > n) e = (x[i] + (n - 1) * e) / n;
    out[i] = e;
  }
  return out;
};
const refRsi = (c: number[], n: number) => {
  const up = c.map((v, i) => (i ? Math.max(v - c[i - 1], 0) : 0)), dn = c.map((v, i) => (i ? Math.max(c[i - 1] - v, 0) : 0));
  const u = refRma(up, n), d = refRma(dn, n);
  return u.map((a, i) => (Number.isNaN(a) ? NaN : d[i] === 0 ? 100 : a === 0 ? 0 : 100 - 100 / (1 + a / d[i])));
};

ok("HMA = WMA(2·WMA(n/2) − WMA(n), √n)", () => {
  const half = refWma(close, 4), full = refWma(close, 9);
  near(values("hma", "HMA"), refWma(half.map((h, i) => 2 * h - full[i]), 3), "hma");
});

ok("Stochastic RSI = SMA(stoch(RSI)), %D = SMA(%K)", () => {
  const r = refRsi(close, 14);
  const raw = r.map((_, i) => {
    if (i < 13 + 14) return NaN;
    const w = r.slice(i - 13, i + 1), hi = Math.max(...w), lo = Math.min(...w);
    return hi === lo ? NaN : (100 * (r[i] - lo)) / (hi - lo);
  });
  const k = refSma(raw, 3);
  near(values("stochrsi", "K"), k, "stochrsi K");
  near(values("stochrsi", "D"), refSma(k, 3), "stochrsi D");
});

ok("Chaikin Money Flow = Σ money-flow volume / Σ volume", () => {
  const mfv = close.map((c, i) => (high[i] === low[i] ? 0 : ((2 * c - low[i] - high[i]) / (high[i] - low[i])) * vol[i]));
  const s = (x: number[], i: number) => x.slice(i - 19, i + 1).reduce((a, b) => a + b, 0);
  near(values("cmf", "CMF"), close.map((_, i) => (i < 19 ? NaN : s(mfv, i) / s(vol, i))), "cmf");
});

ok("Parabolic SAR stays beyond the last two bars and flips sides", () => {
  const sar = values("psar", "ParabolicSAR");
  let flips = 0;
  for (let i = 2; i < sar.length; i++) {
    const below = sar[i] < close[i];
    if (below) assert.ok(sar[i] <= Math.min(low[i - 1], low[i - 2]) + 1e-9, `below at ${i}`);
    else assert.ok(sar[i] >= Math.max(high[i - 1], high[i - 2]) - 1e-9, `above at ${i}`);
    if (i > 2 && below !== sar[i - 1] < close[i - 1]) flips++;
  }
  assert.ok(flips > 5, `only ${flips} reversals`);
});

ok("every indicator: one value per bar, values in the last 100 bars, bounded oscillators stay in range", () => {
  const ranges: Record<string, [number, number]> = { rsi: [0, 100], stoch: [0, 100], stochrsi: [0, 100], mfi: [0, 100], adx: [0, 100], williamsr: [-100, 0],
                                                     aroon: [0, 100], uo: [0, 100], dmi: [0, 100], cmo: [-100, 100], bop: [-1, 1], chop: [0, 100],
                                                     connorsrsi: [0, 100], rci: [-100, 100], rvi: [0, 100], majority: [0, 100], trendstrength: [-1, 1], smii: [-1, 1], ulcer: [0, 100] };
  assert.ok(BASIC_STUDIES.length >= 90, `only ${BASIC_STUDIES.length} indicators`);
  assert.equal(new Set(BASIC_STUDIES.map((s) => s.id)).size, BASIC_STUDIES.length, "duplicate ids");
  for (const s of BASIC_STUDIES) {
    const f = computeStudy(s.id, bars);
    const drawn = (f.drawings?.lines.length ?? 0) + (f.drawings?.labels.length ?? 0);
    assert.ok(f.plots.length > 0 || f.shapes.length > 0 || drawn > 0 || !!f.profiles?.length, `${s.id}: draws nothing`);
    for (const p of f.plots) {
      assert.equal(p.values.length, bars.length, `${s.id} ${p.title}: length`);
      const tail = Array.from(p.values.subarray(-100)).filter(Number.isFinite);
      assert.ok(tail.length >= (s.id === "supertrend" || s.id === "psar" || p.title === "Cross" ? 1 : 100), `${s.id} ${p.title}: ${tail.length} values`);
      const r = ranges[s.id];
      if (r) for (const v of tail) assert.ok(v >= r[0] - 1e-9 && v <= r[1] + 1e-9, `${s.id} ${p.title}: ${v} out of range`);
    }
    for (const b of f.bands) assert.equal(b.upper.length, b.times.length, `${s.id}: band length`);
    assert.ok(s.inputs.every((d) => d.default !== undefined), `${s.id}: input without default`);
  }
});

ok("bands are ordered (upper ≥ basis ≥ lower)", () => {
  for (const id of ["bbands", "keltner", "donchian", "envelope"]) {
    const f = computeStudy(id, bars), get = (t: string) => f.plots.find((p) => p.title === t)!.values;
    const u = get("Upper"), m = get("Basis"), l = get("Lower");
    for (let i = 0; i < bars.length; i++) if (Number.isFinite(u[i])) assert.ok(u[i] >= m[i] && m[i] >= l[i], `${id} at ${i}`);
  }
});

const refEma = (x: number[], n: number) => {
  const f = x.findIndex((v) => !Number.isNaN(v)), out = x.map(() => NaN);
  let e = NaN;
  for (let i = f + n - 1; i < x.length; i++) {
    e = i === f + n - 1 ? x.slice(f, f + n).reduce((s, v) => s + v, 0) / n : x[i] * (2 / (n + 1)) + e * (1 - 2 / (n + 1));
    out[i] = e;
  }
  return out;
};

ok("DEMA and TEMA from nested EMAs", () => {
  const e1 = refEma(close, 9), e2 = refEma(e1, 9), e3 = refEma(e2, 9);
  near(values("dema", "DEMA"), e1.map((a, i) => 2 * a - e2[i]), "dema");
  near(values("tema", "TEMA"), e1.map((a, i) => 3 * (a - e2[i]) + e3[i]), "tema");
});

ok("ALMA and LSMA match their window formulas", () => {
  const m = 0.85 * 8, s = 9 / 6, w = Array.from({ length: 9 }, (_, j) => Math.exp(-((j - m) ** 2) / (2 * s * s))), norm = w.reduce((a, b) => a + b);
  near(values("alma", "ALMA"), close.map((_, i) => (i < 8 ? NaN : w.reduce((acc, wj, j) => acc + close[i - 8 + j] * wj, 0) / norm)), "alma");
  near(values("lsma", "LSMA"), close.map((_, i) => {
    if (i < 24) return NaN;
    const ys = close.slice(i - 24, i + 1), mx = 12, my = ys.reduce((a, b) => a + b) / 25;
    let num = 0, den = 0;
    ys.forEach((y, j) => { num += (j - mx) * (y - my); den += (j - mx) ** 2; });
    return my + (num / den) * (24 - mx);
  }), "lsma");
});

ok("Aroon counts bars since the 15-bar high and low", () => {
  const up = values("aroon", "Aroon Up");
  for (let i = 14; i < bars.length; i++) {
    const w = high.slice(i - 14, i + 1), since = 14 - w.lastIndexOf(Math.max(...w));
    assert.ok(Math.abs(up[i] - (100 * (14 - since)) / 14) < 1e-9, `aroon up at ${i}`);
  }
});

ok("Ichimoku: spans shifted 25 bars, cloud coloured by which span is on top", () => {
  const f = computeStudy("ichimoku", bars), get = (t: string) => f.plots.find((p) => p.title === t)!;
  assert.equal(get("Leading Span A").offset, 25);
  assert.equal(get("Lagging Span").offset, -25);
  assert.equal(f.bands[0].offset, 25);
  assert.ok(f.bands[0].colorDown);
  const mid = (n: number, i: number) => (Math.max(...high.slice(i - n + 1, i + 1)) + Math.min(...low.slice(i - n + 1, i + 1))) / 2;
  near(Array.from(get("Base Line").values).slice(100), close.map((_, i) => mid(26, i)).slice(100), "base line");
});

ok("Awesome Oscillator colours each bar by rising or falling", () => {
  const p = computeStudy("ao", bars).plots[0];
  assert.deepEqual(p.palette, ["#089981", "#F23645"]);
  for (let i = 40; i < bars.length; i++) assert.equal(p.colors![i], p.values[i] >= p.values[i - 1] ? 0 : 1, `ao colour at ${i}`);
});

ok("Fractals mark a high two bars late, at the pivot bar", () => {
  const f = computeStudy("fractals", bars);
  const ups = f.shapes.filter((s) => s.shape === "triangleDown");
  assert.ok(ups.length > 10);
  for (const s of ups) {
    const i = bars.findIndex((b) => b.time === s.time);
    assert.ok([-2, -1, 1, 2].every((d) => high[i + d] < high[i]), `fractal at ${i}`);
  }
});

ok("Zig Zag: alternating swings of at least the deviation, joined end to start", () => {
  const lines = computeStudy("zigzag", bars, { "Price deviation for reversals (%)": 3 }).drawings!.lines;
  assert.ok(lines.length > 5);
  for (let k = 1; k < lines.length; k++) {
    assert.equal(lines[k].x1, lines[k - 1].x2); assert.equal(lines[k].y1, lines[k - 1].y2);
    if (k < lines.length - 1) assert.ok(Math.abs(lines[k].y2 - lines[k].y1) / lines[k].y1 >= 0.03, `swing ${k}`);
    if (k > 1) assert.ok(Math.sign(lines[k].y2 - lines[k].y1) === -Math.sign(lines[k - 1].y2 - lines[k - 1].y1), `alternates at ${k}`);
  }
});

ok("Pivot Points: one set per day from the previous day's high, low and close", () => {
  const d = computeStudy("pivots", bars).drawings!, DAY = 86_400_000;
  const days = new Map<number, { h: number; l: number; c: number }>();
  for (const b of bars) { const k = Math.floor(b.time / DAY), x = days.get(k); days.set(k, x ? { h: Math.max(x.h, b.high), l: Math.min(x.l, b.low), c: b.close } : { h: b.high, l: b.low, c: b.close }); }
  const keys = [...days.keys()].sort((a, b) => a - b);
  assert.equal(d.lines.length, 7 * Math.min(15, keys.length - 1));
  const last = keys[keys.length - 1], prev = days.get(keys[keys.length - 2])!, p = (prev.h + prev.l + prev.c) / 3;
  const set = d.lines.filter((l) => l.x1 === last * DAY);
  near(set.map((l) => l.y1), [p, 2 * p - prev.l, 2 * p - prev.h, p + prev.h - prev.l, p - prev.h + prev.l, prev.h + 2 * (p - prev.l), prev.l - 2 * (prev.h - p)], "pivots");
});

ok("Linear Regression Channel spans the last N bars", () => {
  const [mid, up, dn] = computeStudy("linregchannel", bars).drawings!.lines;
  assert.equal(mid.x1, bars[bars.length - 100].time); assert.equal(mid.x2, bars[bars.length - 1].time);
  assert.ok(Math.abs((up.y1 - mid.y1) - (mid.y1 - dn.y1)) < 1e-9 && up.y1 > mid.y1);
  near([mid.y2], [values("lsma", "LSMA", { Length: 100 }).at(-1)!], "regression end");
});

ok("candlestick patterns: an engulfing and a hammer on hand-built candles", () => {
  const mk = (o: number, h: number, l: number, c: number, i: number): Bar => ({ time: 1_760_000_000_000 + i * 3_600_000, open: o, high: h, low: l, close: c, volume: 1, closed: true });
  const base: Bar[] = Array.from({ length: 30 }, (_, i) => mk(10, 10.6, 9.4, i % 2 ? 10.5 : 9.5, i));
  const engulf = [...base, mk(10, 10.05, 9.85, 9.9, 30), mk(9.85, 10.65, 9.8, 10.6, 31)];
  const params = { "Detect trend based on": "No detection" };
  const shapes = computeStudy("candlepatterns", engulf, params).shapes.filter((s) => s.time === engulf[31].time);
  assert.ok(shapes.some((s) => s.shape === "arrowUp" && s.text === "BE"), JSON.stringify(shapes));
  const hammer = [...base, base[0]];
  hammer[30] = mk(10.2, 10.2, 9.0, 10.0, 30);
  const hs = computeStudy("candlepatterns", hammer, params).shapes.filter((s) => s.time === hammer[30].time).map((s) => s.text);
  assert.ok(hs.includes("H") && hs.includes("HM"), JSON.stringify(hs));
  assert.ok(computeStudy("candlepatterns", bars).shapes.length > 20, "patterns on random bars");
});

const run = async () => {
  const got: EngineOut[] = [];
  const conn = basicEngine.connect((m) => got.push(m));
  const key = "TEST:60", base = bars.slice(0, 500);
  conn.post({ type: "data", key, bars: base });
  for (const s of BASIC_STUDIES) conn.post({ type: "set", id: s.id, study: s.id, params: {} });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(got.filter((m) => m.type === "meta").length, BASIC_STUDIES.length, "meta per indicator");
  assert.equal(got.filter((m) => m.type === "frame" && m.full).length, BASIC_STUDIES.length, "full frame per indicator");
  const moved = { ...bars[499], close: bars[499].close * 1.01, high: Math.max(bars[499].high, bars[499].close * 1.01) };
  got.length = 0;
  conn.post({ type: "bar", key, bar: moved });
  conn.post({ type: "bar", key, bar: bars[500] });
  await new Promise((r) => setTimeout(r, 0));
  const expected = [...base.slice(0, 499), moved, bars[500]];
  for (const s of BASIC_STUDIES) {
    const tails = got.filter((m): m is Extract<EngineOut, { type: "frame" }> => m.type === "frame" && m.id === s.id && !m.full);
    assert.equal(tails.length, 2, `${s.id}: two tail updates`);
    const last = tails[1].frame as { n: number; plots: number[][] };
    assert.equal(last.n, 501, `${s.id}: tail length`);
    const full = computeStudy(s.id, expected);
    full.plots.forEach((p, k) => near(last.plots[k], Array.from(p.values.subarray(-2)), `${s.id} ${p.title} live`));
  }
  conn.close();
  console.log("ok  live ticks: tail updates equal a full recompute");

  const src: EngineOut[] = [];
  const c2 = basicEngine.connect((m) => src.push(m));
  c2.post({ type: "set", id: "r", study: "rsi", params: {} });
  c2.post({ type: "set", id: "e", study: "ema", params: { Source: "@r:RSI", Length: 9 } });
  c2.post({ type: "data", key, bars: base });
  await new Promise((r) => setTimeout(r, 0));
  const emaFrame = src.filter((m): m is Extract<EngineOut, { type: "frame" }> => m.type === "frame" && m.id === "e" && m.full).at(-1)!.frame as { plots: { values: Float64Array }[] };
  near(Array.from(emaFrame.plots[0].values), refEma(refRsi(base.map((b) => b.close), 14), 9), "EMA of RSI");
  src.length = 0;
  c2.post({ type: "remove", id: "r" });
  await new Promise((r) => setTimeout(r, 0));
  const orphan = src.find((m): m is Extract<EngineOut, { type: "frame" }> => m.type === "frame" && m.id === "e")!.frame as { plots: { values: Float64Array }[] };
  assert.ok(Array.from(orphan.plots[0].values).every(Number.isNaN), "removed source gives NaN");
  c2.close();
  console.log("ok  indicator on indicator: an EMA of the RSI, recomputed when the RSI goes");
  console.log(`BASIC OK (${BASIC_STUDIES.length} indicators)`);
};
run().catch((e) => { console.error(e); process.exit(1); });
