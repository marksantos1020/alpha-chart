import { useEffect, useMemo, useRef, useState } from "react";
import type { IndicatorEngine, StudyEntry } from "../types";

interface Props {
  engine?: IndicatorEngine;
  onAdd: (libraryId: string) => void;
  onAddStrategy?: (entry: StudyEntry) => void;
  initialCategory?: string;
  onClose: () => void;
  count: number;
  max: number;
  volumeOnChart?: boolean;
}

const FAV_KEY = "alpha.chart.favorites.v1";
function loadFavs(): string[] { try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]"); } catch { return []; } }

export default function IndicatorPicker({ engine, onAdd, onAddStrategy, initialCategory, onClose, count, max, volumeOnChart = true }: Props) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>(initialCategory ?? "All");
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const [added, setAdded] = useState<string | null>(null);
  const extra = engine?.extra;
  const [mine, setMine] = useState<StudyEntry[] | null>(extra ? null : []);
  const [mineError, setMineError] = useState<string | null>(null);
  useEffect(() => { extra?.list().then(setMine).catch((e) => { setMine([]); setMineError(String(e?.message ?? e)); }); }, [extra]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const vol: StudyEntry = { id: "__volume", name: "Volume (on price pane)", shortTitle: "Vol", overlay: true, category: "Volume",
                              description: "The default volume histogram at the bottom of the price pane" };
    const all: StudyEntry[] = [...(volumeOnChart ? [] : [vol]), ...(engine?.entries() ?? []), ...(mine ?? [])];
    return all.filter((e) =>
      (cat === "All" || (cat === "Favorites" ? favs.includes(e.id) : e.category === cat)) &&
      (!needle || e.name.toLowerCase().includes(needle) || e.shortTitle.toLowerCase().includes(needle) || e.description.toLowerCase().includes(needle)));
  }, [q, cat, favs, volumeOnChart, mine, engine]);

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    setFavs(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch {}
  };
  const add = (id: string) => {
    const entry = list.find((e) => e.id === id);
    if (entry?.kind === "strategy") { onAddStrategy?.(entry); onClose(); return; }
    if (count >= max && id !== "__volume") return;
    onAdd(id);
    setAdded(id);
    window.setTimeout(() => setAdded((a) => (a === id ? null : a)), 900);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal picker" role="dialog" aria-label="Indicators">
        <div className="modal-head">
          <span>Indicators</span>
          <div className="spacer" />
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">✕</button>
        </div>
        <div className="picker-search">
          <input ref={input} className="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter" && list[0]) add(list[0].id); }} />
        </div>
        <div className="picker-body">
          <nav className="picker-cats">
            {["All", "Favorites", ...(engine?.categories ?? ["Volume"])].map((c) => (
              <button key={c} className={c === cat ? "on" : ""} onClick={() => setCat(c)}>{c === "Favorites" ? "★ Favorites" : c}</button>
            ))}
          </nav>
          <div className="picker-list">
            {extra && cat === extra.category && mine === null && <div className="empty">{extra.loading ?? "Loading…"}</div>}
            {extra && cat === extra.category && mine?.length === 0 && <div className="empty">{mineError ?? extra.empty}</div>}
            {list.length === 0 && cat !== extra?.category && <div className="empty">Nothing matches “{q}”</div>}
            {list.map((e) => (
              <div key={e.id} className={`picker-row ${added === e.id ? "added" : ""}`} onClick={() => add(e.id)} title={e.description}>
                <button className={`fav ${favs.includes(e.id) ? "on" : ""}`} onClick={(ev) => { ev.stopPropagation(); toggleFav(e.id); }}
                        title={favs.includes(e.id) ? "Remove from favorites" : "Add to favorites"}>★</button>
                <span className="picker-name">{e.name}</span>
                <span className="picker-desc">{e.description}</span>
                <span className={`picker-tag ${e.kind === "strategy" ? "strategy" : ""}`}>{e.kind === "strategy" ? "strategy" : e.overlay ? "on chart" : "pane"}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <span className="muted">{count} / {max} on this chart{count >= max ? " · remove one to add another" : ""}</span>
          <div className="spacer" />
          <span className="muted">Press <kbd>/</kbd> on the chart to open this list</span>
        </div>
      </div>
    </div>
  );
}
