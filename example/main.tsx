import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlphaChart, ThemeToggle, basicEngine, fmtPrice, useThemeMode, type Datafeed, type OverlayFrame } from "../src";
import { binanceDatafeed } from "./binance";
import { demoDatafeed } from "./demo";
import "../src/styles.css";
import "./example.css";

const INTERVALS: [string, string][] = [["1", "1m"], ["5", "5m"], ["15", "15m"], ["60", "1h"], ["240", "4h"], ["D", "1D"], ["W", "1W"]];
const SYMBOLS = ["TAOUSDT", "BTCUSDT", "ETHUSDT"];
const SOURCES: Record<string, { label: string; feed: Datafeed; credit?: { text: string; href: string } }> = {
  binance: { label: "Binance", feed: binanceDatafeed, credit: { text: "Data: Binance", href: "https://www.binance.com/en/markets" } },
  demo: { label: "Random walk (offline)", feed: demoDatafeed },
};

function App() {
  const [source, setSource] = useState("binance");
  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [interval, setInterval] = useState("60");
  const [marks, setMarks] = useState<number[]>([]);
  const { mode, theme, setMode } = useThemeMode();
  const src = SOURCES[source];
  const overlay = useMemo<OverlayFrame | null>(() => marks.length
    ? { plots: [], bands: [], shapes: [], bgcolors: [], hlines: marks.map((value) => ({ value, title: "Mark", color: "#f2b544", style: "dotted", label: true })) }
    : null, [marks]);
  return (
    <main className="example">
      <AlphaChart
        datafeed={src.feed}
        engine={basicEngine}
        symbol={symbol}
        interval={interval}
        onInterval={setInterval}
        intervals={INTERVALS.map(([k]) => k)}
        name={src.label}
        theme={mode}
        onThemeChange={setMode}
        overlay={overlay}
        contextMenu={({ price }) => [
          { label: `Mark ${fmtPrice(price)}`, onSelect: () => setMarks((m) => [...m, price]) },
          ...(marks.length ? [{ label: "Clear marks", danger: true, onSelect: () => setMarks([]) }] : []),
        ]}
        toolbar={
          <>
            <select className="bar-style" value={symbol} onChange={(e) => { setSymbol(e.target.value); setMarks([]); }} aria-label="Symbol">
              {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <div className="tabs">
              {INTERVALS.map(([k, label]) => <button key={k} className={k === interval ? "on" : ""} onClick={() => setInterval(k)}>{label}</button>)}
            </div>
          </>
        }
        actions={
          <>
            {src.credit && <a className="credit" href={src.credit.href} target="_blank" rel="noreferrer">{src.credit.text}</a>}
            <select className="bar-style" value={source} onChange={(e) => { setSource(e.target.value); setMarks([]); }} aria-label="Data source">
              {Object.entries(SOURCES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
            <ThemeToggle theme={theme} onChange={setMode} />
          </>
        }
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
