import { useEffect, useState } from "react";
import { CloseIcon } from "./icons";

interface Props { onGo: (ms: number) => void; onClose: () => void }

export default function GoToDate({ onGo, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("00:00");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const go = () => {
    const ms = Date.parse(`${date}T${time || "00:00"}:00Z`);
    if (Number.isFinite(ms)) { onGo(ms); onClose(); }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal settings goto" role="dialog" aria-label="Go to date">
        <div className="modal-head"><span>Go to</span><div className="spacer" /><button className="icon-btn" onClick={onClose} title="Close (Esc)" aria-label="Close"><CloseIcon /></button></div>
        <div className="modal-body">
          <div className="form-row">
            <label><span>Date (UTC)</span><input type="date" value={date} min="2025-02-13" max={today} onChange={(e) => setDate(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} autoFocus /></label>
          </div>
          <div className="form-row">
            <label><span>Time (UTC)</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} /></label>
          </div>
        </div>
        <div className="modal-foot"><div className="spacer" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={go}>Go to</button></div>
      </div>
    </div>
  );
}
