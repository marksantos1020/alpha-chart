import { useEffect, useState } from "react";
import { ColorField } from "../indicators/SettingsDialog";
import { CloseIcon } from "../icons";
import { EXTEND_TYPES, FILL_TYPES, LEVEL_TYPES, PRICE_LINE_TYPES, TEXT_TYPES, TOOL_LABEL, type Drawing, type DrawingStyle, type FibLevel } from "./types";

interface Props {
  drawing: Drawing;
  onChange: (patch: Partial<Drawing>) => void;
  onDone: (changed: boolean) => void;
  onCancel: (original: Drawing) => void;
  initialTab?: "style" | "text" | "coords";
  formatPrice: (p: number) => string;
}

export default function DrawingSettings({ drawing, onChange, onDone, onCancel, initialTab = "style", formatPrice }: Props) {
  const [tab, setTab] = useState(initialTab);
  const [original] = useState(() => structuredClone(drawing));
  const s = drawing.style;
  const set = (patch: Partial<DrawingStyle>) => onChange({ style: { ...s, ...patch } });
  const hasText = TEXT_TYPES.has(drawing.type);
  const isFib = LEVEL_TYPES.has(drawing.type);
  const hasFill = FILL_TYPES.has(drawing.type) || isFib && drawing.type !== "fibtime" && drawing.type !== "fibcircles" && drawing.type !== "fibarcs";
  const textual = hasText || drawing.type === "icon";
  const changed = () => JSON.stringify(original) !== JSON.stringify(drawing);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(original); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, original]);

  const setLevel = (i: number, patch: Partial<FibLevel>) => set({ levels: (s.levels ?? []).map((l, k) => (k === i ? { ...l, ...patch } : l)) });

  return (
    <div className="modal-backdrop clear" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(changed()); }}>
      <div className="modal settings" role="dialog" aria-label={`${TOOL_LABEL[drawing.type]} settings`}>
        <div className="modal-head"><span>{TOOL_LABEL[drawing.type]}</span><div className="spacer" />
          <button className="icon-btn" onClick={() => onCancel(original)} title="Close (Esc)" aria-label="Close"><CloseIcon /></button></div>
        <div className="modal-tabs">
          <button className={tab === "style" ? "on" : ""} onClick={() => setTab("style")}>Style</button>
          {hasText && <button className={tab === "text" ? "on" : ""} onClick={() => setTab("text")}>Text</button>}
          <button className={tab === "coords" ? "on" : ""} onClick={() => setTab("coords")}>Coordinates</button>
        </div>
        <div className="modal-body">
          {tab === "style" && (
            <>
              {drawing.type !== "text" && drawing.type !== "icon" && (
                <div className="form-row style-row">
                  <label className="check"><span>Line</span></label>
                  <ColorField value={s.color} onChange={(c) => set({ color: c })} />
                  <select value={s.width} onChange={(e) => set({ width: +e.target.value })} title="Width">{[1, 2, 3, 4].map((w) => <option key={w} value={w}>{w}px</option>)}</select>
                  <select value={s.lineStyle} onChange={(e) => set({ lineStyle: e.target.value as DrawingStyle["lineStyle"] })} title="Style">
                    <option value="solid">solid</option><option value="dashed">dashed</option><option value="dotted">dotted</option>
                  </select>
                </div>
              )}
              {hasFill && (
                <div className="form-row style-row">
                  <label className="check"><input type="checkbox" checked={!!s.fillVisible} onChange={(e) => set({ fillVisible: e.target.checked })} /><span>Background</span></label>
                  <ColorField value={s.fill ?? "rgba(41,98,255,0.2)"} onChange={(c) => set({ fill: c })} />
                </div>
              )}
              {EXTEND_TYPES.has(drawing.type) && (
                <div className="form-row">
                  <label className="check"><input type="checkbox" checked={!!s.extendLeft} onChange={(e) => set({ extendLeft: e.target.checked })} /><span>Extend left</span></label>
                  <label className="check"><input type="checkbox" checked={!!s.extendRight} onChange={(e) => set({ extendRight: e.target.checked })} /><span>Extend right</span></label>
                </div>
              )}
              {PRICE_LINE_TYPES.has(drawing.type) && (
                <div className="form-row"><label className="check"><input type="checkbox" checked={s.showPrice !== false} onChange={(e) => set({ showPrice: e.target.checked })} /><span>Price label on scale</span></label></div>
              )}
              {isFib && (
                <>
                  <div className="form-row">
                    <label className="check"><input type="checkbox" checked={s.showLabels !== false} onChange={(e) => set({ showLabels: e.target.checked })} /><span>Labels</span></label>
                    {["fib", "fibext", "fibchannel"].includes(drawing.type) && <label className="check"><input type="checkbox" checked={!!s.extendRight} onChange={(e) => set({ extendRight: e.target.checked })} /><span>Extend right</span></label>}
                    {drawing.type === "fib" && <label className="check"><input type="checkbox" checked={!!s.reverse} onChange={(e) => set({ reverse: e.target.checked })} /><span>Reverse</span></label>}
                  </div>
                  <h4>Levels</h4>
                  <div className="fib-levels">
                    {(s.levels ?? []).map((l, i) => (
                      <div className="fib-level" key={i}>
                        <input type="checkbox" checked={l.visible} onChange={(e) => setLevel(i, { visible: e.target.checked })} />
                        <input type="number" step="0.001" value={l.value} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setLevel(i, { value: v }); }} />
                        <ColorField value={l.color} onChange={(c) => setLevel(i, { color: c })} />
                      </div>
                    ))}
                  </div>
                </>
              )}
              {drawing.type === "gannfan" && (
                <div className="form-row"><label className="check"><input type="checkbox" checked={s.showLabels !== false} onChange={(e) => set({ showLabels: e.target.checked })} /><span>Labels</span></label></div>
              )}
              {textual && (
                <div className="form-row style-row">
                  <label className="check"><span>{drawing.type === "icon" ? "Size" : "Text colour"}</span></label>
                  {drawing.type !== "icon" && <ColorField value={s.textColor ?? s.color} onChange={(c) => set(drawing.type === "text" ? { textColor: c, color: c } : { textColor: c })} />}
                  <select value={s.fontSize ?? 14} onChange={(e) => set({ fontSize: +e.target.value })} title="Font size">
                    {(drawing.type === "icon" ? [16, 20, 24, 28, 36, 48, 64] : [10, 11, 12, 14, 16, 20, 24, 28, 32, 40]).map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
          {tab === "text" && (
            <textarea className="draw-text" autoFocus value={s.text ?? ""} rows={4} onChange={(e) => set({ text: e.target.value })} />
          )}
          {tab === "coords" && drawing.anchors.slice(0, drawing.type === "brush" ? 0 : undefined).map((a, i) => (
            <div className="form-row" key={i}>
              <label><span>#{i + 1} price</span>
                <input type="number" step="any" value={a.price} onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) onChange({ anchors: drawing.anchors.map((x, k) => (k === i ? { ...x, price: v } : x)) });
                }} />
              </label>
              <span className="muted">{new Date(a.time).toISOString().slice(0, 16).replace("T", " ")} UTC · {formatPrice(a.price)}</span>
            </div>
          ))}
          {tab === "coords" && drawing.type === "brush" && <div className="empty">A brush stroke has {drawing.anchors.length} points; move it by dragging.</div>}
        </div>
        <div className="modal-foot">
          <div className="spacer" />
          <button className="btn" onClick={() => onCancel(original)}>Cancel</button>
          <button className="btn primary" onClick={() => onDone(changed())}>Ok</button>
        </div>
      </div>
    </div>
  );
}
