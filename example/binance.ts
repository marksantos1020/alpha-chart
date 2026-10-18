import type { Bar, Datafeed } from "../src";

const REST = "https://data-api.binance.vision/api/v3/klines";
const STREAM = "wss://data-stream.binance.vision/ws";
const PAGE = 1000;
const IV: Record<string, string> = { "1": "1m", "5": "5m", "15": "15m", "30": "30m", "60": "1h", "120": "2h", "240": "4h", D: "1d", W: "1w" };

type Kline = [number, string, string, string, string, string, number, ...unknown[]];

const toBar = (k: Kline): Bar => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closed: k[6] < Date.now() });

async function klines(symbol: string, interval: string, q: { limit: number; end?: number; start?: number }): Promise<Bar[]> {
  const iv = IV[interval];
  if (!iv) throw new Error(`interval ${interval} is not available`);
  const params = new URLSearchParams({ symbol, interval: iv, limit: String(q.limit) });
  if (q.end !== undefined) params.set("endTime", String(q.end));
  if (q.start !== undefined) params.set("startTime", String(q.start));
  const r = await fetch(`${REST}?${params}`);
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  return ((await r.json()) as Kline[]).map(toBar);
}

export const binanceDatafeed: Datafeed = {
  async getBars(symbol, interval, { limit, end }) {
    let out: Bar[] = [];
    let before = end;
    while (out.length < limit) {
      const want = Math.min(PAGE, limit - out.length);
      const page = await klines(symbol, interval, { limit: want, end: before });
      out = [...page, ...out];
      if (page.length < want) break;
      before = page[0].time - 1;
    }
    return out;
  },

  subscribeBars(symbol, interval, onBars) {
    if (!IV[interval]) return () => undefined;
    let ws: WebSocket | null = null;
    let closed = false, retry = 1000, last = 0, reconnects = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      ws = new WebSocket(`${STREAM}/${symbol.toLowerCase()}@kline_${IV[interval]}`);
      ws.onopen = () => {
        retry = 1000;
        if (reconnects++ > 0 && last) klines(symbol, interval, { limit: PAGE, start: last }).then((bars) => { if (!closed && bars.length) onBars(bars); }).catch(() => undefined);
      };
      ws.onmessage = (e) => {
        const k = JSON.parse(e.data).k;
        if (!k) return;
        last = k.t;
        onBars([{ time: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, closed: k.x }]);
      };
      ws.onclose = () => {
        if (closed) return;
        timer = setTimeout(open, retry);
        retry = Math.min(retry * 2, 30_000);
      };
      ws.onerror = () => ws?.close();
    };
    open();
    return () => {
      closed = true;
      clearTimeout(timer);
      const w = ws;
      if (!w) return;
      w.onmessage = null;
      if (w.readyState === WebSocket.CONNECTING) w.onopen = () => w.close(); else w.close();
    };
  },
};
