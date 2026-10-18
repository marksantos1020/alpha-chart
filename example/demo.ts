import type { Bar, Datafeed } from "../src";

const IV_MS: Record<string, number> = { "1": 60e3, "5": 300e3, "15": 900e3, "60": 3600e3, "240": 14400e3, D: 86400e3, W: 604800e3 };
const HISTORY = 5000;

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}

const series = new Map<string, Bar[]>();

function history(symbol: string, interval: string): Bar[] {
  const key = `${symbol}:${interval}`;
  let bars = series.get(key);
  if (bars) return bars;
  const ms = IV_MS[interval] ?? 60e3;
  const rand = rng([...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  const last = Math.floor(Date.now() / ms) * ms;
  let price = 100;
  bars = [];
  for (let i = HISTORY - 1; i >= 0; i--) {
    const open = price, vol = 0.004 * Math.sqrt(ms / 60e3);
    const close = Math.max(1, open * (1 + (rand() - 0.5) * 2 * vol));
    const high = Math.max(open, close) * (1 + rand() * vol), low = Math.min(open, close) * (1 - rand() * vol);
    bars.push({ time: last - i * ms, open, high, low, close, volume: 100 + rand() * 900, closed: i > 0 });
    price = close;
  }
  series.set(key, bars);
  return bars;
}

export const demoDatafeed: Datafeed = {
  async getBars(symbol, interval, { limit, end }) {
    const bars = history(symbol, interval);
    let hi = bars.length;
    if (end !== undefined) { hi = 0; while (hi < bars.length && bars[hi].time <= end) hi++; }
    return bars.slice(Math.max(0, hi - limit), hi);
  },
  subscribeBars(symbol, interval, onBars) {
    const ms = IV_MS[interval] ?? 60e3, rand = rng(Date.now() >>> 0);
    const timer = setInterval(() => {
      const bars = history(symbol, interval), last = bars[bars.length - 1];
      if (Date.now() >= last.time + ms) {
        bars[bars.length - 1] = { ...last, closed: true };
        bars.push({ time: last.time + ms, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0, closed: false });
      } else {
        const close = last.close * (1 + (rand() - 0.5) * 0.002);
        bars[bars.length - 1] = { ...last, close, high: Math.max(last.high, close), low: Math.min(last.low, close), volume: (last.volume ?? 0) + rand() * 20 };
      }
      onBars(bars.slice(-2));
    }, 1000);
    return () => clearInterval(timer);
  },
  historyStart: (symbol) => history(symbol, "D")[0]?.time,
};
