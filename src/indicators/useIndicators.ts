import { useCallback, useEffect, useRef, useState } from "react";
import type { Bar, EngineConnection, EngineOut, IndicatorEngine } from "../types";
import type { IndicatorFrame, IndicatorInstance, IndicatorState, TailFrame } from "./types";
import { uid } from "../uid";

const STORE_KEY = "alpha.chart.indicators.v1";
const MAX_INSTANCES = 12;

const known = (engine: IndicatorEngine | undefined, id: string | undefined) =>
  !!engine && typeof id === "string" && (!!engine.entry(id) || !!engine.accepts?.(id));

function loadInstances(engine: IndicatorEngine | undefined): IndicatorInstance[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? (JSON.parse(raw) as IndicatorInstance[]) : [];
    return Array.isArray(list) ? list.filter((i) => i && typeof i.id === "string" && known(engine, i.libraryId)) : [];
  } catch { return []; }
}


function mergeTail(f: IndicatorFrame, t: TailFrame): boolean {
  const len = f.plots[0]?.times.length ?? f.bands[0]?.times.length ?? 0;
  if (t.n !== len && t.n !== len + 1) return false;
  const grown = new Map<Float64Array, Float64Array>();
  const grow = (a: Float64Array) => {
    if (t.n === a.length) return a;
    let g = grown.get(a);
    if (!g) { g = new Float64Array(t.n); g.set(a); grown.set(a, g); }
    return g;
  };
  const write = (dst: Float64Array, tail: number[]) => { for (let k = 0; k < tail.length; k++) dst[t.n - tail.length + k] = tail[k]; };
  const times = (a: Float64Array) => { const g = grow(a); write(g, t.times); return g; };
  f.plots.forEach((p, i) => {
    p.times = times(p.times); p.values = grow(p.values); write(p.values, t.plots[i] ?? []);
    const x = t.extras?.[i];
    if (!x) return;
    if (p.colors && x.colors) { p.colors = grow(p.colors); write(p.colors, x.colors); }
    if (p.open && x.open) { p.open = grow(p.open); write(p.open, x.open); }
    if (p.high && x.high) { p.high = grow(p.high); write(p.high, x.high); }
    if (p.low && x.low) { p.low = grow(p.low); write(p.low, x.low); }
  });
  f.bands.forEach((b, i) => { b.times = times(b.times); b.upper = grow(b.upper); b.lower = grow(b.lower); write(b.upper, t.bands[i]?.upper ?? []); write(b.lower, t.bands[i]?.lower ?? []); });
  f.shapes = t.shapes; f.bgcolors = t.bgcolors;
  if (t.barcolors) f.barcolors = t.barcolors;
  if (t.drawings) f.drawings = t.drawings;
  return true;
}

export interface IndicatorEvents {
  onFull?: (id: string) => void;
  onTail?: (id: string, times: number[]) => void;
}

export function useIndicators(engine: IndicatorEngine | undefined, symbol: string, interval: string, bars: Bar[], events: React.MutableRefObject<IndicatorEvents>, dataSeq = 0) {
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const [instances, setInstances] = useState<IndicatorInstance[]>(() => loadInstances(engine));
  const [states, setStates] = useState<Record<string, IndicatorState>>({});
  const [rev, setRev] = useState(0);
  const [customRev, setCustomRev] = useState(0);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const markPending = useCallback((ids: string[], on: boolean) => setPending((cur) => {
    const next = new Set(cur);
    for (const id of ids) { if (on) next.add(id); else next.delete(id); }
    return next.size === cur.size && ids.every((id) => cur.has(id) === on) ? cur : next;
  }), []);
  const instancesRef = useRef<IndicatorInstance[]>([]);
  const frames = useRef(new Map<string, IndicatorFrame>());
  const frameKeys = useRef(new Map<string, string>());
  const worker = useRef<EngineConnection | null>(null);
  const sentInst = useRef(new Map<string, string>());
  const sentData = useRef({ key: "", first: 0, len: 0, seq: 0 });

  useEffect(() => {
    if (!engine) return;
    const w = engine.connect((m: EngineOut) => {
      if (m.type === "meta") {
        setStates((s) => ({ ...s, [m.id]: { inputs: m.inputs, config: m.config, error: null } }));
      } else if (m.type === "error") {
        markPending([m.id], false);
        setStates((s) => ({ ...s, [m.id]: { inputs: s[m.id]?.inputs ?? [], config: s[m.id]?.config ?? {}, error: m.message } }));
      } else if (m.type === "frame") {
        if (m.key !== sentData.current.key) return;
        if (m.full) {
          markPending([m.id], false);
          frames.current.set(m.id, m.frame as IndicatorFrame);
          frameKeys.current.set(m.id, m.key);
          events.current.onFull?.(m.id);
        } else {
          const f = frames.current.get(m.id);
          if (f && frameKeys.current.get(m.id) === m.key && mergeTail(f, m.frame as TailFrame)) events.current.onTail?.(m.id, (m.frame as TailFrame).times);
        }
        setRev((r) => r + 1);
      }
    });
    worker.current = w;
    return () => { w.close(); worker.current = null; sentInst.current.clear(); sentData.current = { key: "", first: 0, len: 0, seq: 0 }; };
  }, [engine, events]);

  instancesRef.current = instances;
  useEffect(() => {
    const w = worker.current;
    if (!w) return;
    const live = new Set(instances.map((i) => i.id));
    for (const id of [...sentInst.current.keys()]) {
      if (!live.has(id)) { markPending([id], false); w.post({ type: "remove", id }); sentInst.current.delete(id); frames.current.delete(id); frameKeys.current.delete(id); events.current.onFull?.(id); }
    }
    for (const inst of instances) {
      const sig = JSON.stringify([inst.libraryId, inst.inputs]);
      if (sentInst.current.get(inst.id) === sig) continue;
      const eng = engineRef.current;
      const entry = eng?.entry(inst.libraryId);
      if (!entry) {
        if (eng?.resolve && eng.accepts?.(inst.libraryId)) {
          eng.resolve(inst.libraryId).then(() => setCustomRev((r) => r + 1)).catch(() =>
            setStates((s) => ({ ...s, [inst.id]: { inputs: [], config: {}, error: "saved script not found (deleted?)" } })));
        }
        continue;
      }
      sentInst.current.set(inst.id, sig);
      markPending([inst.id], true);
      w.post({ type: "set", id: inst.id, study: inst.libraryId, params: inst.inputs });
    }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(instances)); } catch {}
  }, [instances, events, customRev]);

  useEffect(() => {
    const w = worker.current;
    if (!w) return;
    const key = `${symbol}:${interval}`;
    const s = sentData.current;
    if (bars.length === 0) return;
    const first = bars[0].time;
    const grewByOne = bars.length === s.len + 1, same = bars.length === s.len;
    if (key === s.key && first === s.first && dataSeq === s.seq && (same || grewByOne)) {
      w.post({ type: "bar", key, bar: bars[bars.length - 1] });
    } else {
      markPending(instancesRef.current.map((i) => i.id), true);
      w.post({ type: "data", key, bars });
    }
    sentData.current = { key, first, len: bars.length, seq: dataSeq };
  }, [bars, symbol, interval, engine, dataSeq]);

  const frameFor = useCallback((id: string, key: string): IndicatorFrame | undefined => {
    const f = frames.current.get(id);
    if (!f || frameKeys.current.get(id) === key) return f;
    const none = new Float64Array(0);
    return { ...f, plots: f.plots.map((p) => ({ ...p, times: none, values: none, ...(p.colors ? { colors: none } : {}), ...(p.open ? { open: none, high: none, low: none } : {}) })),
             bands: f.bands.map((b) => ({ ...b, times: none, upper: none, lower: none })), shapes: [], bgcolors: [], barcolors: [],
             drawings: f.drawings ? { lines: [], labels: [], boxes: [] } : undefined };
  }, []);

  const hasFrameFor = useCallback((id: string, key: string) => frames.current.has(id) && frameKeys.current.get(id) === key, []);

  const add = useCallback((libraryId: string) => {
    setInstances((list) => list.length >= MAX_INSTANCES ? list
      : [...list, { id: uid(), libraryId, inputs: {}, style: {}, visible: true, overlay: null }]);
  }, []);
  const remove = useCallback((id: string) => setInstances((list) => list.filter((i) => i.id !== id)), []);
  const update = useCallback((id: string, patch: Partial<IndicatorInstance>) =>
    setInstances((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i))), []);
  const duplicate = useCallback((id: string) => setInstances((list) => {
    const src = list.find((i) => i.id === id);
    if (!src || list.length >= MAX_INSTANCES) return list;
    const copy = { ...structuredClone(src), id: uid() };
    const at = list.indexOf(src);
    return [...list.slice(0, at + 1), copy, ...list.slice(at + 1)];
  }), []);
  const move = useCallback((id: string, dir: -1 | 1) => setInstances((list) => {
    const i = list.findIndex((x) => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const out = list.slice(); [out[i], out[j]] = [out[j], out[i]]; return out;
  }), []);
  const reorder = useCallback((id: string, targetId: string) => setInstances((list) => {
    const from = list.findIndex((x) => x.id === id), to = list.findIndex((x) => x.id === targetId);
    if (from < 0 || to < 0 || from === to) return list;
    const out = list.slice();
    const [it] = out.splice(from, 1);
    out.splice(to, 0, it);
    return out;
  }), []);
  const replaceAll = useCallback((list: IndicatorInstance[]) =>
    setInstances(list.filter((i) => known(engineRef.current, i.libraryId)).slice(0, MAX_INSTANCES).map((i) => ({ ...i, id: uid() }))), []);

  return { instances, states, frames, frameFor, hasFrameFor, rev, customRev, pending, add, remove, update, duplicate, move, reorder, replaceAll, max: MAX_INSTANCES };
}
