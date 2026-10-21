import type { Bar, EngineConnection, EngineOut, IndicatorEngine, StudyEntry } from "../types";
import type { IndicatorFrame, TailFrame } from "../indicators/types";
import { STUDIES as BASE, type Ctx, type Series, type Study, type StudyOut } from "./studies";
import { MORE_STUDIES } from "./more";
import { EXTRA_STUDIES } from "./extra";

export const BASIC_CATEGORIES = ["Moving averages", "Bands & channels", "Trend", "Support & resistance", "Oscillators", "Volume"];
export const STUDIES: Study[] = [...BASE, ...MORE_STUDIES, ...EXTRA_STUDIES];

const byId = new Map(STUDIES.map((s) => [s.id, s]));
const TAIL = 2;

function columns(bars: Bar[]): Series {
  const n = bars.length, s: Series = { t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), v: new Float64Array(n) };
  bars.forEach((b, i) => { s.t[i] = b.time; s.o[i] = b.open; s.h[i] = b.high; s.l[i] = b.low; s.c[i] = b.close; s.v[i] = b.volume ?? 0; });
  return s;
}

type External = (ref: string) => Float64Array | undefined;

function context(s: Series, study: Study, params: Record<string, unknown>, external: External = () => undefined): Ctx {
  const p: Record<string, any> = {};
  for (const d of study.inputs) p[d.name] = params[d.name] ?? d.default;
  const src = (name = "close") => {
    if (name.startsWith("@")) { const v = external(name); return v && v.length === s.c.length ? v : new Float64Array(s.c.length).fill(NaN); }
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
  const shapes: IndicatorFrame["shapes"] = [];
  for (const sh of out.shapes ?? []) {
    const off = sh.offset ?? 0;
    for (let i = 0; i < sh.cond.length; i++) if (sh.cond[i] === 1 && i + off >= 0) shapes.push({ time: times[i + off], shape: sh.shape, location: sh.location, color: sh.color, ...(sh.text ? { text: sh.text } : {}) });
  }
  return {
    plots: out.plots.map((p) => ({
      title: p.title, pane: 0, style: p.style ?? "line", color: p.color, width: p.width ?? (p.style === "columns" ? 1 : 2), lineStyle: p.lineStyle ?? "solid",
      colorUp: p.colorUp, colorDown: p.colorDown, colorBy: p.colorBy, display: p.display ?? "all", times, values: p.values,
      ...(p.offset ? { offset: p.offset } : {}), ...(p.palette && p.colors ? { palette: p.palette, colors: p.colors } : {}),
    })),
    bands: (out.bands ?? []).map((b) => ({ title: b.title, color: b.color, times, upper: fill(b.upper), lower: fill(b.lower),
                                           ...(b.offset ? { offset: b.offset } : {}), ...(b.colorDown ? { colorDown: b.colorDown } : {}) })),
    hlines: out.hlines ?? [],
    shapes,
    bgcolors: [],
    ...(out.drawings ? { drawings: out.drawings } : {}),
    ...(out.profiles ? { profiles: out.profiles } : {}),
  };
}

function tail(f: IndicatorFrame, n: number, times: Float64Array): TailFrame {
  const last = (a: Float64Array) => Array.from(a.subarray(Math.max(0, a.length - TAIL)));
  return {
    n, times: last(times), plots: f.plots.map((p) => last(p.values)),
    bands: f.bands.map((b) => ({ upper: last(b.upper), lower: last(b.lower) })), shapes: f.shapes, bgcolors: [],
    extras: f.plots.map((p) => (p.colors ? { colors: last(p.colors) } : null)),
    ...(f.drawings ? { drawings: f.drawings } : {}),
  };
}

export function computeStudy(id: string, bars: Bar[], params: Record<string, unknown> = {}, external?: External): IndicatorFrame {
  const study = byId.get(id);
  if (!study) throw new Error(`unknown indicator ${id}`);
  const s = columns(bars);
  return frame(study.run(context(s, study, params, external)), s.t);
}

const refsOf = (params: Record<string, unknown>) =>
  Object.values(params).filter((v): v is string => typeof v === "string" && v.startsWith("@") && v.indexOf(":") > 1);

export const basicEngine: IndicatorEngine = {
  categories: BASIC_CATEGORIES,
  entries: (): StudyEntry[] => STUDIES,
  entry: (id) => byId.get(id),
  indicatorSources: true,
  connect(onMessage: (m: EngineOut) => void): EngineConnection {
    const insts = new Map<string, { study: Study; params: Record<string, unknown> }>();
    const frames = new Map<string, IndicatorFrame>();
    let key = "", bars: Bar[] = [], open = true;
    const send = (m: EngineOut) => queueMicrotask(() => { if (open) onMessage(m); });
    const external: External = (ref) => {
      const cut = ref.indexOf(":");
      return frames.get(ref.slice(1, cut))?.plots.find((p) => p.title === ref.slice(cut + 1))?.values;
    };
    const ordered = () => {
      const out: string[] = [], seen = new Set<string>(), visiting = new Set<string>();
      const visit = (id: string) => {
        if (seen.has(id) || visiting.has(id) || !insts.has(id)) return;
        visiting.add(id);
        for (const r of refsOf(insts.get(id)!.params)) visit(r.slice(1, r.indexOf(":")));
        visiting.delete(id); seen.add(id); out.push(id);
      };
      for (const id of insts.keys()) visit(id);
      return out;
    };
    const dependents = (id: string) => ordered().filter((o) => refsOf(insts.get(o)!.params).some((r) => r.startsWith(`@${id}:`)));
    const compute = (id: string, full: boolean, done = new Set<string>()) => {
      const it = insts.get(id);
      if (!it || !bars.length || done.has(id)) return;
      done.add(id);
      try {
        const s = columns(bars), f = frame(it.study.run(context(s, it.study, it.params, external)), s.t);
        frames.set(id, f);
        send(full ? { type: "frame", id, key, full: true, frame: f } : { type: "frame", id, key, full: false, frame: tail(f, bars.length, s.t) });
      } catch (e) {
        frames.delete(id);
        send({ type: "error", id, message: e instanceof Error ? e.message : String(e) });
      }
      if (full) for (const d of dependents(id)) compute(d, true, done);
    };
    return {
      post(m) {
        if (m.type === "data") {
          key = m.key; bars = m.bars.slice();
          const done = new Set<string>();
          for (const id of ordered()) compute(id, true, done);
        } else if (m.type === "bar") {
          if (m.key !== key) return;
          const last = bars[bars.length - 1];
          if (last && m.bar.time === last.time) bars[bars.length - 1] = m.bar;
          else if (!last || m.bar.time > last.time) bars.push(m.bar);
          else return;
          for (const id of ordered()) compute(id, false);
        } else if (m.type === "set") {
          const study = byId.get(m.study);
          if (!study) { send({ type: "error", id: m.id, message: `unknown indicator ${m.study}` }); return; }
          insts.set(m.id, { study, params: m.params });
          send({ type: "meta", id: m.id, inputs: study.inputs, config: study.config });
          compute(m.id, true);
        } else if (m.type === "remove") {
          const deps = dependents(m.id);
          insts.delete(m.id); frames.delete(m.id);
          const done = new Set<string>();
          for (const d of deps) compute(d, true, done);
        }
      },
      close() { open = false; insts.clear(); },
    };
  },
};
