import type { PriceFormat } from "lightweight-charts";
import { fmtNum, priceDecimals } from "../format";
import type { StudyEntry } from "../types";
import type { IndicatorConfig, IndicatorFrame, IndicatorInstance, IndicatorState, PlotFrame } from "./types";

export function legendTitle(entry: StudyEntry, inst: IndicatorInstance, state: IndicatorState | undefined,
                            sourceLabel: (v: string) => string = (v) => v): { name: string; args: string } {
  const cfg = state?.config ?? {};
  const defs = state?.inputs ?? [];
  const pick = cfg.titleInputs
    ? defs.filter((d) => cfg.titleInputs!.includes(d.name))
    : defs.filter((d) => (d.type === "int" || d.type === "float" || d.type === "source" || d.type === "select") && d.group !== "Style" && d.group !== "Bands");
  const args = pick.map((d) => { const v = String(inst.inputs[d.name] ?? d.default); return d.type === "source" && v.startsWith("@") ? sourceLabel(v) : v; }).join(" ");
  return { name: cfg.shortTitle ?? entry.shortTitle, args };
}

export function indexAt(times: Float64Array, timeMs: number | null): number {
  if (times.length === 0) return -1;
  if (timeMs === null) return times.length - 1;
  let lo = 0, hi = times.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (times[m] === timeMs) return m;
    if (times[m] < timeMs) lo = m + 1; else hi = m - 1;
  }
  return -1;
}

export function precisionFor(cfg: IndicatorConfig, frame: IndicatorFrame | undefined, overlay: boolean, symbolPrecision: number): number {
  if (cfg.precision !== undefined) return cfg.precision;
  if (overlay) return symbolPrecision;
  let mag = 0;
  for (const p of frame?.plots ?? []) {
    for (let i = p.values.length - 1, seen = 0; i >= 0 && seen < 50; i--) {
      const v = Math.abs(p.values[i]);
      if (Number.isFinite(v)) { mag = Math.max(mag, v); seen++; }
    }
  }
  if (mag >= 100) return 2;
  if (mag >= 1) return Math.min(4, priceDecimals(mag));
  return mag > 0 ? priceDecimals(mag) : 2;
}

export function priceFormatFor(cfg: IndicatorConfig, precision: number): PriceFormat {
  if (cfg.format === "volume") return { type: "volume", precision: 2, minMove: 0.01 };
  if (cfg.format === "percent") return { type: "percent", precision: 2, minMove: 0.01 };
  return { type: "price", precision, minMove: Math.pow(10, -precision) };
}

export function formatValue(v: number, cfg: IndicatorConfig, precision: number): string {
  if (!Number.isFinite(v)) return "∅";
  if (cfg.format === "volume") return fmtNum(v, 2);
  if (cfg.format === "percent") return `${v.toFixed(2)}%`;
  return v.toFixed(precision);
}

export function plotColorAt(p: PlotFrame, i: number, styleColor: { color?: string; colorUp?: string; colorDown?: string } | undefined,
                            candleUp: (t: number) => boolean | undefined): string {
  if (p.palette && p.colors) { const k = p.colors[i]; if (Number.isInteger(k) && k >= 0 && k < p.palette.length) return p.palette[k]; }
  if ((p.style === "candle" || p.style === "bar") && p.open) return p.values[i] >= p.open[i] ? styleColor?.colorUp ?? p.colorUp ?? p.color : styleColor?.colorDown ?? p.colorDown ?? p.color;
  const up = styleColor?.colorUp ?? p.colorUp, down = styleColor?.colorDown ?? p.colorDown;
  if ((up || down) && (p.style === "histogram" || p.style === "columns" || p.style === "baseline")) {
    const v = p.values[i];
    const isUp = p.colorBy === "candle" ? candleUp(p.times[i]) ?? true : v >= (p.baseValue ?? 0);
    return (isUp ? up : down) ?? p.color;
  }
  return styleColor?.color ?? p.color;
}
