import { useEffect, useRef } from "react";
import type { Drawing } from "./types";

interface Props {
  drawing: Drawing;
  x: number;
  y: number;
  onClose: () => void;
  onSettings: () => void;
  onClone: () => void;
  onLock: () => void;
  onHide: () => void;
  onFront: () => void;
  onBack: () => void;
  onRemove: () => void;
}

export default function DrawingMenu(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) p.onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") p.onClose(); };
    window.addEventListener("mousedown", close); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [p]);
  const act = (fn: () => void) => () => { fn(); p.onClose(); };
  const left = Math.min(p.x, window.innerWidth - 220), top = Math.min(p.y, window.innerHeight - 280);
  return (
    <div ref={ref} className="ind-menu draw-menu" style={{ position: "fixed", left, top }} role="menu">
      <button onClick={act(p.onSettings)}>Settings…</button>
      <button onClick={act(p.onClone)}>Clone</button>
      <button onClick={act(p.onLock)}>{p.drawing.locked ? "Unlock" : "Lock"}</button>
      <button onClick={act(p.onHide)}>Hide</button>
      <hr />
      <button onClick={act(p.onFront)}>Bring to front</button>
      <button onClick={act(p.onBack)}>Send to back</button>
      <hr />
      <button className="danger" onClick={act(p.onRemove)}>Remove</button>
    </div>
  );
}
