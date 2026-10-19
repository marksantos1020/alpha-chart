import { useEffect, useRef, useState, type ReactNode } from "react";
import { BAR_STYLE_GROUPS, BAR_STYLES, type BarStyle } from "./settings";

const svg = (children: ReactNode) => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">{children}</svg>
);

export const CHART_TYPE_ICONS: Record<BarStyle, ReactNode> = {
  bars: svg(<><path d="M9.5 6v16M7 10h2.5M9.5 18H12" /><path d="M18.5 4v15M16 8h2.5M18.5 15H21" /></>),
  candles: svg(<><path d="M9.5 5v4M9.5 20v4" /><rect x="7.5" y="9.5" width="4" height="10" fill="currentColor" /><path d="M18.5 4v4M18.5 17v4" /><rect x="16.5" y="8.5" width="4" height="8.5" /></>),
  hollow: svg(<><path d="M9.5 5v4M9.5 20v4" /><rect x="7.5" y="9.5" width="4" height="10" /><path d="M18.5 4v4M18.5 17v4" /><rect x="16.5" y="8.5" width="4" height="8.5" /></>),
  line: svg(<path d="M4 20l6-7 5 4 9-11" />),
  linemarkers: svg(<><path d="M5.5 19l4.5-5.5 5 4 7.5-10" /><circle cx="4.5" cy="20" r="1.5" /><circle cx="10" cy="13.5" r="1.5" /><circle cx="15" cy="17.5" r="1.5" /><circle cx="23" cy="7" r="1.5" /></>),
  step: svg(<path d="M4 21h5v-6h6v4h4V7h5" />),
  area: svg(<><path d="M4 19l6-7 5 4 9-11" /><path d="M4 19l6-7 5 4 9-11V24H4z" fill="currentColor" fillOpacity="0.25" stroke="none" /></>),
  hlcarea: svg(<><path d="M4 12l6-5 5 3 9-6" /><path d="M4 21l6-4 5 2 9-5" /><path d="M4 12l6-5 5 3 9-6v10l-9 5-5-2-6 4z" fill="currentColor" fillOpacity="0.2" stroke="none" /></>),
  baseline: svg(<><path d="M4 14h20" strokeDasharray="2 2" /><path d="M4 19l5-7 5 6 5-11 5 4" /></>),
  columns: svg(<><rect x="5.5" y="15.5" width="4" height="8" /><rect x="12" y="9.5" width="4" height="14" /><rect x="18.5" y="12.5" width="4" height="11" /></>),
  highlow: svg(<><rect x="6.5" y="8.5" width="5" height="12" /><rect x="16.5" y="4.5" width="5" height="11" /></>),
  heikin: svg(<><path d="M9.5 6v3M9.5 20v3" /><rect x="7.5" y="9.5" width="4" height="10" fill="currentColor" /><path d="M18.5 5v4M18.5 16v6" /><rect x="16.5" y="9.5" width="4" height="6.5" fill="currentColor" fillOpacity="0.35" /></>),
};

export default function ChartTypeMenu({ value, onChange }: { value: BarStyle; onChange: (v: BarStyle) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", key); };
  }, [open]);
  const label = BAR_STYLES.find(([k]) => k === value)?.[1] ?? value;
  return (
    <div className="chart-type" ref={ref}>
      <button className={`btn tool icon chart-type-btn ${open ? "on" : ""}`} onClick={() => setOpen(!open)} title={label}
              aria-label="Chart type" aria-haspopup="menu" aria-expanded={open}>
        {CHART_TYPE_ICONS[value]}
      </button>
      {open && (
        <div className="chart-type-menu" role="menu" aria-label="Chart type">
          {BAR_STYLE_GROUPS.map((group, g) => (
            <div key={g} className="chart-type-group">
              {group.map(([k, l]) => (
                <button key={k} role="menuitemradio" aria-checked={k === value} className={k === value ? "on" : ""}
                        onClick={() => { onChange(k); setOpen(false); }}>
                  {CHART_TYPE_ICONS[k]}<span>{l}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
