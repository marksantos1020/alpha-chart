import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlphaChart, type Datafeed } from "../src";
import { binanceDatafeed } from "./binance";
import { demoDatafeed, demoEngine } from "./demo";
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
  const src = SOURCES[source];
  return (
    <main className="example">
      <AlphaChart
        datafeed={src.feed}
        engine={demoEngine}
        symbol={symbol}
        interval={interval}
        onInterval={setInterval}
        intervals={INTERVALS.map(([k]) => k)}
        name={src.label}
        toolbar={
          <>
            <select className="bar-style" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Symbol">
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
            <select className="bar-style" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Data source">
              {Object.entries(SOURCES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </>
        }
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
