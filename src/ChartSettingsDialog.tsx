import { useEffect, useRef, useState } from "react";
import { ColorField } from "./indicators/SettingsDialog";
import { BAR_STYLES, DEFAULT_SETTINGS, PRECISIONS, TIMEZONES, type BarStyle, type ChartSettings, type ScaleMode } from "./settings";
import type { BlockClock } from "./countdown";
import { CloseIcon } from "./icons";
import { THEME_MODES, type ThemeMode } from "./theme";

interface Props {
  settings: ChartSettings;
  onChange: (s: ChartSettings) => void;
  onClose: () => void;
  block?: BlockClock;
  barInfoLabel?: string;
  theme?: ThemeMode;
  onThemeChange?: (mode: ThemeMode) => void;
}

type Tab = "symbol" | "status" | "scales" | "canvas" | "block";

export default function ChartSettingsDialog({ settings: s, onChange, onClose, block, barInfoLabel, theme, onThemeChange }: Props) {
  const [tab, setTab] = useState<Tab>("symbol");
  const [original] = useState(s);
  const [originalTheme] = useState(theme);
  const cancel = () => { onChange(original); if (originalTheme && originalTheme !== theme) onThemeChange?.(originalTheme); onClose(); };
  const cancelRef = useRef(cancel); cancelRef.current = cancel;
  const set = (patch: Partial<ChartSettings>) => onChange({ ...s, ...patch });
  const setStatus = (k: keyof ChartSettings["status"], v: boolean) => onChange({ ...s, status: { ...s.status, [k]: v } });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cancelRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const check = (label: string, value: boolean, fn: (v: boolean) => void) => (
    <div className="form-row"><label className="check wide"><input type="checkbox" checked={value} onChange={(e) => fn(e.target.checked)} /><span>{label}</span></label></div>
  );

  return (
    <div className="modal-backdrop clear" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal settings wide" role="dialog" aria-label="Chart settings">
        <div className="modal-head"><span>Chart settings</span><div className="spacer" />
          <button className="icon-btn" onClick={cancel} title="Close (Esc)" aria-label="Close"><CloseIcon /></button></div>
        <div className="modal-tabs">
          {([["symbol", "Symbol"], ["status", "Status line"], ["scales", "Scales"], ["canvas", "Canvas"], ["block", block ? "Block" : "Countdown"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div className="modal-body">
          {tab === "symbol" && (
            <>
              <div className="form-row"><label><span>Bar style</span>
                <select value={s.barStyle} onChange={(e) => set({ barStyle: e.target.value as BarStyle })}>{BAR_STYLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </label></div>
              <div className="form-row"><label><span>Precision</span>
                <select value={String(s.precision)} onChange={(e) => set({ precision: e.target.value === "default" ? "default" : Number(e.target.value) })} aria-label="Precision">
                  {PRECISIONS.map(([k, l]) => <option key={String(k)} value={String(k)}>{l}</option>)}
                </select>
              </label></div>
              <div className="form-row"><label><span>Up colour</span><ColorField value={s.upColor} onChange={(c) => set({ upColor: c })} /></label></div>
              <div className="form-row"><label><span>Down colour</span><ColorField value={s.downColor} onChange={(c) => set({ downColor: c })} /></label></div>
              {check("Wicks", s.wicks, (v) => set({ wicks: v }))}
              {check("Borders", s.borders, (v) => set({ borders: v }))}
              {check("Last price line", s.lastPriceLine, (v) => set({ lastPriceLine: v }))}
            </>
          )}
          {tab === "status" && (
            <>
              {check("OHLC values", s.status.ohlc, (v) => setStatus("ohlc", v))}
              {check("Bar change", s.status.change, (v) => setStatus("change", v))}
              {check("Volume", s.status.volume, (v) => setStatus("volume", v))}
              {barInfoLabel && check(barInfoLabel, s.status.blocks, (v) => setStatus("blocks", v))}
              {check("Indicator arguments", s.status.indicatorArgs, (v) => setStatus("indicatorArgs", v))}
              {check("Indicator values", s.status.indicatorValues, (v) => setStatus("indicatorValues", v))}
            </>
          )}
          {tab === "scales" && (
            <>
              <div className="form-row"><label><span>Scale</span>
                <select value={s.scaleMode} onChange={(e) => set({ scaleMode: e.target.value as ScaleMode })}>
                  <option value="normal">Regular</option><option value="log">Logarithmic</option><option value="percent">Percent</option><option value="indexed">Indexed to 100</option>
                </select>
              </label></div>
              {check("Invert scale", s.invert, (v) => set({ invert: v }))}
              {check("Auto scale", s.autoScale, (v) => set({ autoScale: v }))}
            </>
          )}
          {tab === "canvas" && (
            <>
              {theme && onThemeChange && (
                <div className="form-row"><label><span>Theme</span>
                  <select value={theme} onChange={(e) => onThemeChange(e.target.value as ThemeMode)}>{THEME_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </label></div>
              )}
              {check("Grid lines", s.grid, (v) => set({ grid: v }))}
              <div className="form-row"><label><span>Time zone</span>
                <select value={s.timezone} onChange={(e) => set({ timezone: e.target.value })}>{TIMEZONES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </label></div>
            </>
          )}
          {tab === "block" && (
            <>
              <div className="form-row"><label><span>Countdown to bar close</span>
                <select value={s.countdown} onChange={(e) => set({ countdown: e.target.value as ChartSettings["countdown"] })}>
                  <option value="time">time</option>
                  {block && <option value="blocks">{block.name ?? "block"}s (~{Math.round(block.ms / 1000)} s)</option>}
                  <option value="off">off</option>
                </select>
              </label></div>
              {block && <p className="muted small">A bar closes when the first {block.name ?? "block"} past its end arrives, so the countdown in {block.name ?? "block"}s is the honest one; in time it assumes {Math.round(block.ms / 1000)} s per {block.name ?? "block"}.</p>}
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={() => onChange({ ...DEFAULT_SETTINGS })}>Defaults</button>
          <div className="spacer" />
          <button className="btn" onClick={cancel}>Cancel</button>
          <button className="btn primary" onClick={onClose}>Ok</button>
        </div>
      </div>
    </div>
  );
}
