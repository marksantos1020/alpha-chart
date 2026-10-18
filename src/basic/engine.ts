import type { Bar, EngineConnection, EngineOut, IndicatorEngine, StudyEntry } from "../types";
import type { IndicatorFrame, TailFrame } from "../indicators/types";
import { STUDIES, type Ctx, type Series, type Study, type StudyOut } from "./studies";

export const BASIC_CATEGORIES = ["Moving averages", "Bands & channels", "Trend", "Oscillators", "Volume"];

const byId = new Map(STUDIES.map((s) => [s.id, s]));
const TAIL = 2;

function columns(bars: Bar[]): Series {
  const n = bars.length, s: Series = { t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), v: new Float64Array(n) };
  bars.forEach((b, i) => { s.t[i] = b.time; s.o[i] = b.open; s.h[i] = b.high; s.l[i] = b.low; s.c[i] = b.close; s.v[i] = b.volume ?? 0; });
  return s;
}

function context(s: Series, study: Study, params: Record<string, unknown>): Ctx {
  const p: Record<string, any> = {};
  for (const d of study.inputs) p[d.name] = params[d.name] ?? d.default;
  const src = (name = "close") => {
    switch (name) {
      case "open": return s.o; case "high": return s.h; case "low": return s.l;
      case "hl2": return s.h.map((h, i) => (h + s.l[i]) / 2);
      case "hlc3": return s.h.map((h, i) => (h + s.l[i] + s.c[i]) / 3);
      case "ohlc4": return s.h.map((h, i) => (s.o[i] + h + s.l[i] + s.c[i]) / 4);
      case "hlcc4": return s.h.map((h, i) => (h + s.l[i] + 2 * s.c[i]) / 4);
      default: return s.c;
    }
  };
  return { ...s, p, src };
}

function frame(out: StudyOut, times: Float64Array): IndicatorFrame {
  const fill = (x: Float64Array | number) => (typeof x === "number" ? new Float64Array(times.length).fill(x) : x);
  return {
    plots: out.plots.map((p) => ({
      title: p.title, pane: 0, style: p.style ?? "line", color: p.color, width: p.width ?? (p.style === "columns" ? 1 : 2), lineStyle: p.lineStyle ?? "solid",
      colorUp: p.colorUp, colorDown: p.colorDown, colorBy: p.colorBy, display: p.display ?? "all", times, values: p.values,
    })),
    bands: (out.bands ?? []).map((b) => ({ title: b.title, color: b.color, times, upper: fill(b.upper), lower: fill(b.lower) })),
    hlines: out.hlines ?? [],
    shapes: [],
    bgcolors: [],
  };
}

function tail(f: IndicatorFrame, n: number): TailFrame {
  const last = (a: Float64Array) => Array.from(a.subarray(Math.max(0, a.length - TAIL)));
  return {
    n, times: f.plots[0] ? last(f.plots[0].times) : [], plots: f.plots.map((p) => last(p.values)),
    bands: f.bands.map((b) => ({ upper: last(b.upper), lower: last(b.lower) })), shapes: [], bgcolors: [],
  };
}

export function computeStudy(id: string, bars: Bar[], params: Record<string, unknown> = {}): IndicatorFrame {
  const study = byId.get(id);
  if (!study) throw new Error(`unknown indicator ${id}`);
  const s = columns(bars);
  return frame(study.run(context(s, study, params)), s.t);
}

export const basicEngine: IndicatorEngine = {
  categories: BASIC_CATEGORIES,
  entries: (): StudyEntry[] => STUDIES,
  entry: (id) => byId.get(id),
  connect(onMessage: (m: EngineOut) => void): EngineConnection {
    const insts = new Map<string, { study: Study; params: Record<string, unknown> }>();
    let key = "", bars: Bar[] = [], open = true;
    const send = (m: EngineOut) => queueMicrotask(() => { if (open) onMessage(m); });
    const compute = (id: string, full: boolean) => {
      const it = insts.get(id);
      if (!it || !bars.length) return;
      try {
        const s = columns(bars), f = frame(it.study.run(context(s, it.study, it.params)), s.t);
        send(full ? { type: "frame", id, key, full: true, frame: f } : { type: "frame", id, key, full: false, frame: tail(f, bars.length) });
      } catch (e) {
        send({ type: "error", id, message: e instanceof Error ? e.message : String(e) });
      }
    };
    return {
      post(m) {
        if (m.type === "data") {
          key = m.key; bars = m.bars.slice();
          for (const id of insts.keys()) compute(id, true);
        } else if (m.type === "bar") {
          if (m.key !== key) return;
          const last = bars[bars.length - 1];
          if (last && m.bar.time === last.time) bars[bars.length - 1] = m.bar;
          else if (!last || m.bar.time > last.time) bars.push(m.bar);
          else return;
          for (const id of insts.keys()) compute(id, false);
        } else if (m.type === "set") {
          const study = byId.get(m.study);
          if (!study) { send({ type: "error", id: m.id, message: `unknown indicator ${m.study}` }); return; }
          insts.set(m.id, { study, params: m.params });
          send({ type: "meta", id: m.id, inputs: study.inputs, config: study.config });
          compute(m.id, true);
        } else if (m.type === "remove") insts.delete(m.id);
      },
      close() { open = false; insts.clear(); },
    };
  },
};
