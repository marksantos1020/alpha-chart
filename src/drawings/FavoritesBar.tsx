import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { TOOL_LABEL, type ToolId } from "./types";
import type { DrawingsStore } from "./useDrawings";
import { ToolIcon } from "./toolIcons";

interface Props { store: DrawingsStore; onTool: () => void }

export default function FavoritesBar({ store, onTool }: Props) {
  const p = store.prefs;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(p.favPos ?? { x: 64, y: 40 });
  const clamp = (x: number, y: number) => {
    const el = ref.current, host = el?.parentElement;
    if (!el || !host) return { x, y };
    return { x: Math.max(0, Math.min(x, host.clientWidth - el.offsetWidth)), y: Math.max(0, Math.min(y, host.clientHeight - el.offsetHeight)) };
  };
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const fit = () => setPos((q) => { const c = clamp(q.x, q.y); return c.x === q.x && c.y === q.y ? q : c; });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, [p.favorites.length, p.showFavorites]);

  if (!p.showFavorites || p.favorites.length === 0) return null;

  const drag = (e: ReactPointerEvent) => {
    e.preventDefault();
    const sx = e.clientX - pos.x, sy = e.clientY - pos.y;
    let last = pos;
    const move = (ev: PointerEvent) => { last = clamp(ev.clientX - sx, ev.clientY - sy); setPos(last); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); store.setPref("favPos", last); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const pick = (t: ToolId) => { store.setTool(store.tool === t ? "cursor" : t); onTool(); };

  return (
    <div className="fav-bar" ref={ref} role="toolbar" aria-label="Favorite drawing tools" style={{ left: pos.x, top: pos.y }}>
      <span className="fav-grip" onPointerDown={drag} aria-hidden="true" />
      {p.favorites.map((t) => (
        <button key={t} className={`dt-btn ${store.tool === t ? "on" : ""}`} aria-label={TOOL_LABEL[t]} title={TOOL_LABEL[t]} onClick={() => pick(t)}>
          <ToolIcon name={t} />
        </button>
      ))}
    </div>
  );
}
