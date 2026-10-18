import { useCallback, useEffect, useRef, useState } from "react";
import type { ChartStorage } from "../types";
import type { Drawing, DrawingsDoc, ToolId } from "./types";

// local copy per symbol: the chart opens with it at once, the storage answer follows
const LOCAL = (symbol: string) => `alpha.chart.drawings.v2.${symbol}`;
const PREFS = "alpha.chart.drawprefs.v1";
const MAX_UNDO = 100;

interface Prefs { magnet: "off" | "weak" | "strong"; stay: boolean; lockAll: boolean; hideAll: boolean }
function loadPrefs(): Prefs {
  try { return { magnet: "off", stay: false, lockAll: false, hideAll: false, ...JSON.parse(localStorage.getItem(PREFS) ?? "{}") }; }
  catch { return { magnet: "off", stay: false, lockAll: false, hideAll: false }; }
}
function readLocal(symbol: string): { items: Drawing[]; updated: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL(symbol)) ?? "null");
    if (raw && Array.isArray(raw.items)) return { items: raw.items, updated: raw.updated ?? 0 };
  } catch {}
  return { items: [], updated: 0 };
}

export function useDrawings(symbol: string, storage: ChartStorage) {
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const [items, setItemsState] = useState<Drawing[]>(() => readLocal(symbol).items);
  const ref = useRef<Drawing[]>(items);
  const [selected, setSelected] = useState<string | null>(null);
  const selRef = useRef<string | null>(null);
  const [tool, setToolState] = useState<ToolId>("cursor");
  const toolRef = useRef<ToolId>("cursor");
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const past = useRef<Drawing[][]>([]), future = useRef<Drawing[][]>([]);
  const [, setUndoRev] = useState(0);
  const save = useRef<{ timer: ReturnType<typeof setTimeout> | null; symbol: string }>({ timer: null, symbol });
  const loadedFor = useRef("");

  const apply = useCallback((next: Drawing[]) => { ref.current = next; setItemsState(next); }, []);

  const persist = useCallback((n: string, list: Drawing[]) => {
    const updated = Date.now();
    try { localStorage.setItem(LOCAL(n), JSON.stringify({ items: list, updated })); } catch {}
    if (save.current.timer) clearTimeout(save.current.timer);
    save.current = {
      symbol: n,
      timer: setTimeout(async () => {
        save.current.timer = null;
        try {
          const doc: DrawingsDoc = { schemaVersion: 1, items: list };
          const r = await storageRef.current.saveDrawings(n, doc, updated);
          if (!r.ok && loadedFor.current === n) {
            apply(r.conflict.doc.items as Drawing[]);
            try { localStorage.setItem(LOCAL(n), JSON.stringify({ items: r.conflict.doc.items, updated: r.conflict.updated })); } catch {}
          }
        } catch {}
      }, 600),
    };
  }, [apply]);

  useEffect(() => {
    let alive = true;
    const local = readLocal(symbol);
    apply(local.items);
    past.current = []; future.current = []; setUndoRev((r) => r + 1);
    selRef.current = null; setSelected(null);
    loadedFor.current = symbol;
    storageRef.current.loadDrawings(symbol).then((srv) => {
      if (!alive) return;
      if (srv.doc && srv.updated > local.updated) {
        apply(srv.doc.items as Drawing[]);
        try { localStorage.setItem(LOCAL(symbol), JSON.stringify({ items: srv.doc.items, updated: srv.updated })); } catch {}
      } else if (local.updated > srv.updated && local.items.length) {
        storageRef.current.saveDrawings(symbol, { schemaVersion: 1, items: local.items }, local.updated).catch(() => undefined);
      }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [symbol, apply]);

  const setItems = useCallback((next: Drawing[], undoFrom?: Drawing[]) => {
    if (undoFrom) {
      past.current.push(undoFrom);
      if (past.current.length > MAX_UNDO) past.current.shift();
      future.current = [];
      setUndoRev((r) => r + 1);
    }
    apply(next);
    if (undoFrom) persist(symbol, next);
  }, [apply, persist, symbol]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(ref.current);
    apply(prev); persist(symbol, prev); setUndoRev((r) => r + 1);
    if (selRef.current && !prev.some((d) => d.id === selRef.current)) { selRef.current = null; setSelected(null); }
  }, [apply, persist, symbol]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(ref.current);
    apply(next); persist(symbol, next); setUndoRev((r) => r + 1);
  }, [apply, persist, symbol]);

  const select = useCallback((id: string | null) => { selRef.current = id; setSelected(id); }, []);
  const setTool = useCallback((t: ToolId) => { toolRef.current = t; setToolState(t); }, []);
  const setPref = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => {
    const n = { ...p, [k]: v };
    try { localStorage.setItem(PREFS, JSON.stringify(n)); } catch {}
    return n;
  }), []);

  const update = useCallback((id: string, patch: Partial<Drawing>, undoable = true) => {
    const before = ref.current;
    setItems(before.map((d) => (d.id === id ? { ...d, ...patch } : d)), undoable ? before : undefined);
  }, [setItems]);
  const remove = useCallback((id: string) => {
    const before = ref.current;
    if (!before.some((d) => d.id === id)) return;
    setItems(before.filter((d) => d.id !== id), before);
    if (selRef.current === id) select(null);
  }, [setItems, select]);
  const removeAll = useCallback(() => { const before = ref.current; if (before.length) { setItems([], before); select(null); } }, [setItems, select]);
  const reorderZ = useCallback((id: string, to: "front" | "back") => {
    const before = ref.current, d = before.find((x) => x.id === id);
    if (!d) return;
    const rest = before.filter((x) => x.id !== id);
    setItems(to === "front" ? [...rest, d] : [d, ...rest], before);
  }, [setItems]);

  return {
    items, ref, selected, selRef, select, tool, toolRef, setTool, prefs, prefsRef, setPref,
    setItems, update, remove, removeAll, reorderZ, undo, redo,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
  };
}

export type DrawingsStore = ReturnType<typeof useDrawings>;
