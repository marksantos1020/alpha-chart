import { useEffect, useMemo, useState } from "react";
import { CloseIcon, InfoIcon, Chevron } from "../icons";
import type { IndicatorFrame, IndicatorInstance, IndicatorState, InputDef, PlotStyle } from "./types";

interface Props {
  instance: IndicatorInstance;
  state: IndicatorState | undefined;
  frame: IndicatorFrame | undefined;
  title: string;
  onChange: (patch: Partial<IndicatorInstance>) => void;
  onClose: () => void;
}

function parseColor(c: string): { hex: string; a: number } {
  const m6 = /^#([0-9a-f]{6})$/i.exec(c);
  if (m6) return { hex: `#${m6[1]}`, a: 1 };
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(c);
  if (m) {
    const hex = "#" + [m[1], m[2], m[3]].map((x) => Math.min(255, +x).toString(16).padStart(2, "0")).join("");
    return { hex, a: m[4] === undefined ? 1 : +m[4] };
  }
  return { hex: "#2962ff", a: 1 };
}
function toColor(hex: string, a: number): string {
  if (a >= 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.round(a * 100) / 100})`;
}

export function ColorField({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { hex, a } = parseColor(value);
  return (
    <span className="color-field">
      <input type="color" value={hex} onChange={(e) => onChange(toColor(e.target.value, a))} />
      <input type="range" min={0} max={100} value={Math.round(a * 100)} title={`opacity ${Math.round(a * 100)}%`}
             onChange={(e) => onChange(toColor(hex, +e.target.value / 100))} />
    </span>
  );
}

export function optionLabel(o: string): string {
  if (/^[a-z]+\d$/.test(o)) return o.toUpperCase();
  return o.charAt(0).toUpperCase() + o.slice(1);
}

function InputField({ def, value, onChange }: { def: InputDef; value: unknown; onChange: (v: unknown) => void }) {
  switch (def.type) {
    case "bool":
      return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
    case "select": case "source":
      return <select value={String(value)} onChange={(e) => onChange(e.target.value)}>{def.options?.map((o) => <option key={o} value={o}>{def.type === "source" ? optionLabel(o) : o}</option>)}</select>;
    case "color":
      return <ColorField value={String(value)} onChange={onChange} />;
    case "string":
      return <input type="text" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    default: {
      const int = def.type === "int";
      return <input type="number" value={Number(value)} min={def.min} max={def.max} step={def.step ?? (int ? 1 : 0.1)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "" || raw === "-") return;
                      let v = int ? Math.round(+raw) : +raw;
                      if (!Number.isFinite(v)) return;
                      if (def.min !== undefined) v = Math.max(def.min, v);
                      if (def.max !== undefined) v = Math.min(def.max, v);
                      onChange(v);
                    }} />;
    }
  }
}

const WIDTHS = [1, 2, 3, 4] as const;
const VIS_INTERVALS: [string, string][] = [["1", "1m"], ["3", "3m"], ["5", "5m"], ["15", "15m"], ["30", "30m"], ["60", "1h"], ["120", "2h"], ["240", "4h"], ["D", "1D"]];

export default function SettingsDialog({ instance, state, frame, title, onChange, onClose }: Props) {
  const [tab, setTab] = useState<"inputs" | "style" | "visibility">("inputs");
  const [original] = useState(() => structuredClone(instance));
  const [menu, setMenu] = useState(false);
  const defs = state?.inputs ?? [];
  const values = (d: InputDef) => (instance.inputs[d.name] !== undefined ? instance.inputs[d.name] : d.default);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { onChange(original); onClose(); } if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange, onClose, original]);

  const groups = useMemo(() => {
    const out: { name: string; rows: InputDef[][] }[] = [];
    for (const d of defs.filter((x) => x.type !== "color")) {
      const g = d.group ?? "";
      let grp = out.find((x) => x.name === g);
      if (!grp) { grp = { name: g, rows: [] }; out.push(grp); }
      const last = grp.rows[grp.rows.length - 1];
      if (d.inline && last && last[0].inline === d.inline) last.push(d); else grp.rows.push([d]);
    }
    return out;
  }, [defs]);

  const setInput = (name: string, v: unknown) => onChange({ inputs: { ...instance.inputs, [name]: v } });
  const setStyle = (key: string, patch: PlotStyle) => onChange({ style: { ...instance.style, [key]: { ...instance.style[key], ...patch } } });

  const plots = frame?.plots ?? [];
  const bands = frame?.bands ?? [];
  const hlines = frame?.hlines ?? [];
  const seen = new Set<string>();

  const info = (d: InputDef) => d.tooltip ? <span className="field-info" title={d.tooltip}><InfoIcon /></span> : null;
  const field = (row: InputDef[]) => {
    const [d, ...rest] = row;
    if (d.type === "bool" && rest.length === 0) {
      return (
        <label className="check" key={d.name} title={d.tooltip}>
          <InputField def={d} value={values(d)} onChange={(v) => setInput(d.name, v)} /><span>{d.name}</span>
        </label>
      );
    }
    return [
      <label key={d.name}>
        <span className="field-name">{d.name}</span>
        <span className={rest.length ? "field-ctl part" : "field-ctl"}>
          <InputField def={d} value={values(d)} onChange={(v) => setInput(d.name, v)} />{rest.length === 0 && info(d)}
        </span>
      </label>,
      rest.length > 0 && (
        <span className="field-rest" key={`${d.name}:rest`}>
          {rest.map((r) => (
            <label key={r.name} title={r.tooltip}><span>{r.name}</span><InputField def={r} value={values(r)} onChange={(v) => setInput(r.name, v)} /></label>
          ))}
        </span>
      ),
    ];
  };
  const cancel = () => { onChange(original); onClose(); };

  return (
    <div className="modal-backdrop clear" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal settings" role="dialog" aria-label={`${title} settings`}>
        <div className="modal-head">
          <span>{title}</span>
          <div className="spacer" />
          <button className="icon-btn" onClick={cancel} title="Close (Esc)" aria-label="Close"><CloseIcon /></button>
        </div>
        <div className="modal-tabs">
          <button className={tab === "inputs" ? "on" : ""} onClick={() => setTab("inputs")}>Inputs</button>
          <button className={tab === "style" ? "on" : ""} onClick={() => setTab("style")}>Style</button>
          <button className={tab === "visibility" ? "on" : ""} onClick={() => setTab("visibility")}>Visibility</button>
        </div>
        <div className="modal-body">
          {state?.error && <div className="form-error">{state.error}</div>}
          {tab === "inputs" && (
            groups.length === 0 ? <div className="empty">This indicator has no inputs</div> : (
              <div className="field-grid">
                {groups.map((g) => [
                  g.name ? <h4 key={`h:${g.name}`}>{g.name}</h4> : null,
                  ...g.rows.map(field),
                ])}
              </div>
            )
          )}
          {tab === "visibility" && (
            <>
              <h4>Show on intervals</h4>
              <div className="vis-grid">
                {VIS_INTERVALS.map(([key, label]) => {
                  const on = !instance.intervals || instance.intervals.includes(key);
                  return (
                    <label className="check" key={key}><input type="checkbox" checked={on} onChange={(e) => {
                      const cur = instance.intervals ?? VIS_INTERVALS.map(([k]) => k);
                      const next = e.target.checked ? [...new Set([...cur, key])] : cur.filter((k) => k !== key);
                      onChange({ intervals: next.length === VIS_INTERVALS.length ? undefined : next });
                    }} /><span>{label}</span></label>
                  );
                })}
              </div>
            </>
          )}
          {tab === "style" && (
            <>
              {plots.map((p) => {
                if (seen.has(p.title)) return null;
                seen.add(p.title);
                const st = instance.style[p.title] ?? {};
                const twoColor = (p.style === "histogram" || p.style === "columns" || p.style === "baseline") && (p.colorUp || p.colorDown);
                return (
                  <div className="form-row style-row" key={`p:${p.title}`}>
                    <label className="check"><input type="checkbox" checked={st.visible !== false} onChange={(e) => setStyle(p.title, { visible: e.target.checked })} /><span>{p.title}</span></label>
                    {twoColor ? (
                      <>
                        <ColorField value={st.colorUp ?? p.colorUp ?? p.color} onChange={(c) => setStyle(p.title, { colorUp: c })} />
                        <ColorField value={st.colorDown ?? p.colorDown ?? p.color} onChange={(c) => setStyle(p.title, { colorDown: c })} />
                      </>
                    ) : (
                      <ColorField value={st.color ?? p.color} onChange={(c) => setStyle(p.title, { color: c })} />
                    )}
                    {!(p.style === "histogram" || p.style === "columns") && (
                      <>
                        <select value={st.width ?? p.width ?? 1} onChange={(e) => setStyle(p.title, { width: +e.target.value })} title="Line width">
                          {WIDTHS.map((w) => <option key={w} value={w}>{w}px</option>)}
                        </select>
                        <select value={st.lineStyle ?? p.lineStyle ?? "solid"} onChange={(e) => setStyle(p.title, { lineStyle: e.target.value as PlotStyle["lineStyle"] })} title="Line style">
                          <option value="solid">solid</option><option value="dashed">dashed</option><option value="dotted">dotted</option>
                        </select>
                      </>
                    )}
                  </div>
                );
              })}
              {bands.map((b) => {
                const key = `fill:${b.title}`, st = instance.style[key] ?? {};
                return (
                  <div className="form-row style-row" key={key}>
                    <label className="check"><input type="checkbox" checked={st.visible !== false} onChange={(e) => setStyle(key, { visible: e.target.checked })} /><span>{b.title}</span></label>
                    <ColorField value={st.color ?? b.color} onChange={(c) => setStyle(key, { color: c })} />
                  </div>
                );
              })}
              {hlines.map((h) => {
                const key = `hline:${h.title ?? h.value}`, st = instance.style[key] ?? {};
                return (
                  <div className="form-row style-row" key={key}>
                    <label className="check"><input type="checkbox" checked={st.visible !== false} onChange={(e) => setStyle(key, { visible: e.target.checked })} /><span>{h.title ?? "Level"} <span className="muted">{h.value}</span></span></label>
                    <ColorField value={st.color ?? h.color ?? "#787B86"} onChange={(c) => setStyle(key, { color: c })} />
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div className="modal-foot">
          <div className="defaults">
            <button className="btn ghost" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>Defaults<Chevron up={menu} size={16} /></button>
            {menu && (
              <div className="defaults-menu" role="menu">
                <button role="menuitem" onClick={() => { onChange({ inputs: {}, style: {}, intervals: undefined }); setMenu(false); }}>Reset settings</button>
              </div>
            )}
          </div>
          <div className="spacer" />
          <button className="btn" onClick={cancel}>Cancel</button>
          <button className="btn primary" onClick={onClose}>Ok</button>
        </div>
      </div>
    </div>
  );
}
