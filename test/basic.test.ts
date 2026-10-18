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
  const ranges: Record<string, [number, number]> = { rsi: [0, 100], stoch: [0, 100], stochrsi: [0, 100], mfi: [0, 100], adx: [0, 100], williamsr: [-100, 0] };
  assert.ok(BASIC_STUDIES.length >= 25, `only ${BASIC_STUDIES.length} indicators`);
  for (const s of BASIC_STUDIES) {
    const f = computeStudy(s.id, bars);
    assert.ok(f.plots.length > 0, `${s.id}: no plots`);
    for (const p of f.plots) {
      assert.equal(p.values.length, bars.length, `${s.id} ${p.title}: length`);
      const tail = Array.from(p.values.subarray(-100)).filter(Number.isFinite);
      assert.ok(tail.length >= (s.id === "supertrend" || s.id === "psar" ? 1 : 100), `${s.id} ${p.title}: ${tail.length} values`);
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
  console.log(`BASIC OK (${BASIC_STUDIES.length} indicators)`);
};
run().catch((e) => { console.error(e); process.exit(1); });
