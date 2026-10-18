import { useCallback, useEffect, useRef, useState } from "react";
import type { Bar, Datafeed } from "./types";
import type { RangeKey } from "./BottomBar";

export const FIRST_PAGE = 1000;
export const OLDER_PAGE = 2000;
const MAX_PAGES = 60;

export interface ViewRequest { seq: number; from?: number; to?: number; center?: number }

export const INTERVAL_MS: Record<string, number> = {
  "1": 60e3, "3": 180e3, "5": 300e3, "15": 900e3, "30": 1800e3, "60": 3600e3, "120": 7200e3, "240": 14400e3, D: 86400e3, W: 604800e3,
};

/** Interval and start for each range button; the interval falls back to the current one when the
 *  host does not offer it. */
function rangePlan(r: RangeKey, now: number, historyStart: number): [string, number] {
  const day = 86_400_000;
  const plan: Record<RangeKey, [string, number]> = {
    "1D": ["1", now - day], "5D": ["5", now - 5 * day], "1M": ["30", now - 30 * day], "3M": ["60", now - 91 * day],
    "6M": ["120", now - 182 * day], "YTD": ["240", Date.UTC(new Date(now).getUTCFullYear(), 0, 1)], "1Y": ["240", now - 365 * day],
    "All": ["D", historyStart],
  };
  return plan[r];
}

/** Merges live bars into the loaded list: replaces the bar with the same time, appends newer ones,
 *  and never replaces a final bar with a non-final one. */
export function mergeBars(prev: Bar[], incoming: Bar[]): Bar[] {
  if (incoming.length === 0) return prev;
  let out = prev;
  for (const b of incoming) {
    const last = out[out.length - 1];
    if (!last) { out = [b]; continue; }
    if (b.time === last.time) out = [...out.slice(0, -1), b];
    else if (b.time > last.time) out = [...out, b];
    else {
      const i = out.findIndex((x) => x.time === b.time);
      if (i >= 0 && (b.final || !out[i].final)) out = [...out.slice(0, i), b, ...out.slice(i + 1)];
    }
  }
  return out;
}

const NO_BARS: Bar[] = [];

export interface DatafeedState {
  /** Bars of the current symbol:interval (empty while another one is loading). */
  bars: Bar[];
  /** Bumps on every fresh load: the chart redraws from scratch on a new generation. */
  dataSeq: number;
  loading: boolean;
  fetching: boolean;
  loadOlder: () => void;
  showRange: (r: RangeKey) => void;
  goTo: (ms: number) => void;
  viewRequest: ViewRequest | null;
}

/** Loads bars for the chart from a Datafeed: the latest page, older pages while scrolling left,
 *  live updates, and the history a range or go-to needs before the view moves. */
export function useDatafeed(feed: Datafeed, symbol: string, interval: string,
                            onInterval?: (iv: string) => void, intervals?: string[]): DatafeedState {
  const [bars, setBars] = useState<Bar[]>([]);
  const barsRef = useRef<Bar[]>([]);
  barsRef.current = bars;
  const [dataSeq, setDataSeq] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(0);
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const current = useRef({ symbol, interval });
  current.current = { symbol, interval };
  const loadedKey = useRef("");
  const older = useRef({ key: "", busy: false, done: false });

  const track = useCallback(async <T,>(p: Promise<T>): Promise<T> => {
    setFetching((n) => n + 1);
    try { return await p; } finally { setFetching((n) => Math.max(0, n - 1)); }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const key = `${symbol}:${interval}`;
    const page = { key, busy: false, done: true };
    older.current = page;
    loadedKey.current = "";
    setBars([]);
    const unsubscribe = feedRef.current.subscribeBars?.(symbol, interval, (incoming) => {
      if (!alive || loadedKey.current !== key) return;
      setBars((prev) => mergeBars(prev, incoming));
    });
    (async () => {
      try {
        const got = await track(feedRef.current.getBars(symbol, interval, { limit: FIRST_PAGE }));
        if (!alive) return;
        setBars(got);
        loadedKey.current = key;
        setDataSeq((s) => s + 1);
        page.done = got.length === 0;
      } catch {
        if (alive) setBars([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; unsubscribe?.(); };
  }, [symbol, interval, feed, track]);

  const fetchOlder = useCallback(async (key: string, st: { key: string; busy: boolean; done: boolean }) => {
    const first = barsRef.current[0];
    if (!first) return false;
    const [sym, iv] = key.split(":");
    const got = await track(feedRef.current.getBars(sym, iv, { limit: OLDER_PAGE, end: first.time - 1 }));
    if (loadedKey.current !== key || older.current !== st) return false;
    if (got.length < OLDER_PAGE) st.done = true;
    if (got.length && barsRef.current[0]?.time === first.time) {
      const merged = [...got.filter((b) => b.time < first.time), ...barsRef.current];
      barsRef.current = merged;
      setBars(merged);
    }
    return true;
  }, [track]);

  const loadOlder = useCallback(async () => {
    const key = `${symbol}:${interval}`, st = older.current;
    if (st.key !== key || st.busy || st.done || !barsRef.current[0]) return;
    st.busy = true;
    try { await fetchOlder(key, st); } catch {} finally { st.busy = false; }
  }, [symbol, interval, fetchOlder]);

  const ensureHistory = useCallback(async (key: string, fromMs: number) => {
    for (let n = 0; n < MAX_PAGES; n++) {
      if (loadedKey.current !== key) return false;
      const first = barsRef.current[0], st = older.current;
      if (!first || first.time <= fromMs || st.key !== key || st.done) return true;
      if (st.busy) { await new Promise((r) => setTimeout(r, 50)); continue; }
      st.busy = true;
      try { if (!(await fetchOlder(key, st))) return false; } finally { st.busy = false; }
    }
    return true;
  }, [fetchOlder]);

  const [viewRequest, setViewRequest] = useState<ViewRequest | null>(null);
  const pendingView = useRef<{ key: string; from?: number; to?: number; center?: number } | null>(null);
  const runPending = useCallback(async () => {
    const p = pendingView.current, key = `${current.current.symbol}:${current.current.interval}`;
    if (!p || p.key !== key || loadedKey.current !== key) return;
    pendingView.current = null;
    const iv = key.split(":")[1];
    const target = p.from ?? (p.center !== undefined ? p.center - 150 * (INTERVAL_MS[iv] ?? 900e3) : undefined);
    if (target !== undefined && !(await ensureHistory(key, target))) return;
    setViewRequest({ seq: Date.now(), from: p.from, to: p.to, center: p.center });
  }, [ensureHistory]);
  useEffect(() => { runPending(); }, [dataSeq, runPending]);

  const requestView = useCallback((iv: string, req: { from?: number; to?: number; center?: number }) => {
    const usable = iv !== interval && onInterval && (!intervals || intervals.includes(iv)) ? iv : interval;
    pendingView.current = { key: `${symbol}:${usable}`, ...req };
    if (usable !== interval) onInterval!(usable); else runPending();
  }, [symbol, interval, onInterval, intervals, runPending]);

  const showRange = useCallback((r: RangeKey) => {
    const now = Date.now();
    const [iv, from] = rangePlan(r, now, feedRef.current.historyStart?.(symbol) ?? 0);
    requestView(iv, { from, to: now });
  }, [requestView, symbol]);
  const goTo = useCallback((ms: number) => requestView(interval, { center: ms }), [requestView, interval]);

  const key = `${symbol}:${interval}`;
  return { bars: loadedKey.current === key ? bars : NO_BARS, dataSeq, loading, fetching: fetching > 0, loadOlder, showRange, goTo, viewRequest };
}
