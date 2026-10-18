import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlphaChart } from "../src";
import { demoDatafeed, demoEngine } from "./demo";
import "../src/styles.css";
import "./example.css";

const INTERVALS: [string, string][] = [["1", "1m"], ["5", "5m"], ["15", "15m"], ["60", "1h"], ["240", "4h"], ["D", "1D"]];
const SYMBOLS = ["DEMO", "WALK"];

function App() {
  const [symbol, setSymbol] = useState("DEMO");
  const [interval, setInterval] = useState("15");
  return (
    <main className="example">
      <AlphaChart
        datafeed={demoDatafeed}
        engine={demoEngine}
        symbol={symbol}
        interval={interval}
        onInterval={setInterval}
        intervals={INTERVALS.map(([k]) => k)}
        name="random walk"
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
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
