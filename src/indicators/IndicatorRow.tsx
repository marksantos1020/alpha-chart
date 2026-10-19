import { useEffect, useRef, useState } from "react";
import { LegendIcons } from "../icons";

export interface RowValue { text: string; color: string }

interface Props {
  name: string;
  args: string;
  values: RowValue[];
  visible: boolean;
  error: string | null;
  overlay: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onSettings: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMovePane: () => void;
  onMove: (dir: -1 | 1) => void;
  onReset: () => void;
  onSource?: () => void;
  loading?: boolean;
  onInterval?: boolean;
  dragId?: string;
  onDropOn?: (draggedId: string) => void;
}

export function LoadingDots() {
  return <span className="loading-dots" role="status" aria-label="loading"><i /><i /><i /></span>;
}

export default function IndicatorRow(p: Props) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);
  const act = (fn: () => void) => () => { setMenu(false); fn(); };

  return (
    <div ref={ref} className={`ind-row ${p.visible && p.onInterval !== false ? "" : "hidden"} ${menu ? "menu-open" : ""}`}
         draggable={!!p.dragId}
         onDragStart={(e) => { if (p.dragId) { e.dataTransfer.setData("text/x-indicator", p.dragId); e.dataTransfer.effectAllowed = "move"; } }}
         onDragOver={(e) => { if (p.onDropOn && e.dataTransfer.types.includes("text/x-indicator")) { e.preventDefault(); e.currentTarget.classList.add("drop"); } }}
         onDragLeave={(e) => e.currentTarget.classList.remove("drop")}
         onDrop={(e) => { e.currentTarget.classList.remove("drop"); const id = e.dataTransfer.getData("text/x-indicator"); if (id && id !== p.dragId) p.onDropOn?.(id); }}>
      <span className="ind-title" onDoubleClick={p.onSettings} title="Double-click for settings · drag to reorder">
        {p.name}{p.args && <span className="ind-args"> {p.args}</span>}
      </span>
      {p.error ? <span className="ind-error" title={p.error}>error: {p.error}</span>
        : p.onInterval === false ? <span className="ind-args">hidden on this interval</span>
        : p.visible && p.values.map((v, i) => <span key={i} className="ind-val" style={{ color: v.color }}>{v.text}</span>)}
      {p.loading && !p.error && <LoadingDots />}
      <span className="ind-ctl">
        <button title={p.visible ? "Hide" : "Show"} aria-label={p.visible ? "Hide" : "Show"} onClick={p.onToggle}>{p.visible ? <LegendIcons.eye /> : <LegendIcons.eyeOff />}</button>
        <button title="Settings" aria-label="Settings" onClick={p.onSettings}><LegendIcons.settings /></button>
        {p.onSource && <button title="Source code" aria-label="Source code" onClick={p.onSource}><LegendIcons.source /></button>}
        <button title="Remove" aria-label="Remove" onClick={p.onRemove}><LegendIcons.remove /></button>
        <button title="More" aria-label="More" aria-haspopup="menu" onClick={() => setMenu((m) => !m)}><LegendIcons.more /></button>
      </span>
      {menu && (
        <div className="ind-menu" role="menu">
          <button onClick={act(p.onSettings)}>Settings…</button>
          <button onClick={act(p.onToggle)}>{p.visible ? "Hide" : "Show"}</button>
          <button onClick={act(p.onMovePane)}>{p.overlay ? "Move to new pane below" : "Move to price pane"}</button>
          {p.canMoveUp && <button onClick={act(() => p.onMove(-1))}>Move up</button>}
          {p.canMoveDown && <button onClick={act(() => p.onMove(1))}>Move down</button>}
          <button onClick={act(p.onDuplicate)}>Duplicate</button>
          <button onClick={act(p.onReset)}>Reset settings</button>
          <hr />
          <button className="danger" onClick={act(p.onRemove)}>Remove</button>
        </div>
      )}
    </div>
  );
}
