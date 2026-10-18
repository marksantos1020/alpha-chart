import { useEffect, useRef, useState } from "react";
import { TIMEZONES, clock, type ChartSettings } from "./settings";

export type RangeKey = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "All";
export const RANGES: RangeKey[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "All"];

interface Props {
  settings: ChartSettings;
  onSettings: (patch: Partial<ChartSettings>) => void;
  onRange: (r: RangeKey) => void;
  onGoTo: () => void;
  onOpenSettings: () => void;
  onReset: () => void;
}

export default function BottomBar({ settings, onSettings, onRange, onGoTo, onOpenSettings, onReset }: Props) {
  const [now, setNow] = useState(Date.now());
  const [tzOpen, setTzOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!tzOpen) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setTzOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [tzOpen]);
  const mode = settings.scaleMode;

  return (
    <div className="chart-bottom">
      <div className="tabs ranges">
        {RANGES.map((r) => <button key={r} onClick={() => onRange(r)} title={`Show ${r === "All" ? "all history" : r}`}>{r}</button>)}
      </div>
      <button className="bb-btn" onClick={onGoTo} title="Go to date (Alt+G)" aria-label="Go to date">⇥ Go to</button>
      <div className="spacer" />
      <div className="bb-tz" ref={ref}>
        <button className="bb-btn" onClick={() => setTzOpen(!tzOpen)} title="Time zone">{clock(now, settings.timezone)}</button>
        {tzOpen && (
          <div className="tmpl-menu bb-tz-menu" role="menu">
            {TIMEZONES.map(([tz, label]) => (
              <button key={tz} className={`tmpl-item ${settings.timezone === tz ? "on" : ""}`} onClick={() => { onSettings({ timezone: tz }); setTzOpen(false); }}>
                {settings.timezone === tz ? "✓ " : ""}{label}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="tool-sep" />
      <button className={`bb-btn ${mode === "percent" ? "on" : ""}`} title="Percent scale" onClick={() => onSettings({ scaleMode: mode === "percent" ? "normal" : "percent" })}>%</button>
      <button className={`bb-btn ${mode === "log" ? "on" : ""}`} title="Logarithmic scale (Alt+L)" onClick={() => onSettings({ scaleMode: mode === "log" ? "normal" : "log" })}>log</button>
      <button className={`bb-btn ${settings.autoScale ? "on" : ""}`} title="Auto scale" onClick={() => onSettings({ autoScale: !settings.autoScale })}>auto</button>
      <button className="bb-btn" title="Reset chart view (Alt+R)" onClick={onReset}>⟲</button>
      <button className="bb-btn" title="Chart settings" aria-label="Chart settings" onClick={onOpenSettings}>⚙</button>
    </div>
  );
}
