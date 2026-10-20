import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { TOOL_LABEL, type ToolId } from "./types";
import type { DrawingsStore } from "./useDrawings";

const I: Record<string, ReactNode> = {
  cursor: <><path d="M9 2v14M2 9h14" /></>,
  trend: <><path d="M3 15L15 3" /><circle cx="3" cy="15" r="1.6" /><circle cx="15" cy="3" r="1.6" /></>,
  ray: <><path d="M3 15L16 2" /><circle cx="3" cy="15" r="1.6" /><circle cx="8" cy="10" r="1.6" /></>,
  extended: <><path d="M1 17L17 1" /><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="6" r="1.6" /></>,
  arrow: <><path d="M3 15L15 3M15 3h-6M15 3v6" /></>,
  hline: <><path d="M1 9h16" /><circle cx="9" cy="9" r="1.6" /></>,
  hray: <><path d="M5 9h12" /><circle cx="5" cy="9" r="1.6" /></>,
  vline: <><path d="M9 1v16" /><circle cx="9" cy="9" r="1.6" /></>,
  crossline: <><path d="M1 9h16M9 1v16" /></>,
  channel: <><path d="M2 12L12 3M6 16L16 7" /></>,
  rect: <><rect x="3" y="4" width="12" height="10" /></>,
  fib: <><path d="M2 3h14M2 7h14M2 11h14M2 15h14" /></>,
  fibext: <><path d="M2 15L7 6L11 11M9 3h7M9 8h7M9 13h7" /></>,
  brush: <><path d="M2 14c3-1 3-6 6-6s2 5 5 5 3-3 3-5" /></>,
  text: <><path d="M4 4h10M9 4v11M6.5 15h5" /></>,
  measure: <><path d="M2 16L16 2M5 13l2 2M8 10l2 2M11 7l2 2" /></>,
  zoom: <><circle cx="7.5" cy="7.5" r="5" /><path d="M11 11l5 5M5.5 7.5h4M7.5 5.5v4" /></>,
  zoomout: <><circle cx="7.5" cy="7.5" r="5" /><path d="M11 11l5 5M5.5 7.5h4" /></>,
  magnet: <><path d="M4 3v6a5 5 0 0 0 10 0V3M4 6h3M11 6h3" /></>,
  stay: <><path d="M3 15L15 3" /><path d="M11 15h5M13.5 12.5v5" /></>,
  lock: <><rect x="4" y="8" width="10" height="8" rx="1" /><path d="M6 8V5.5a3 3 0 0 1 6 0V8" /></>,
  unlock: <><rect x="4" y="8" width="10" height="8" rx="1" /><path d="M6 8V5.5a3 3 0 0 1 6-.5" /></>,
  eye: <><path d="M1 9s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z" /><circle cx="9" cy="9" r="2.2" /></>,
  eyeoff: <><path d="M1 9s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z" /><path d="M2 2l14 14" /></>,
  trash: <><path d="M3 5h12M7 5V3h4v2M5 5l1 11h6l1-11" /></>,
};
const Icon = ({ name }: { name: string }) => (
  <svg width="28" height="28" viewBox="-5 -5 28 28" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">{I[name]}</svg>
);

const Chevron = ({ up = false }: { up?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={up ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} />
  </svg>
);

const MoreArrow = () => (
  <svg width="5" height="8" viewBox="0 0 5 8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 1l3 3-3 3" />
  </svg>
);

const GROUPS: { key: string; tools: ToolId[] }[] = [
  { key: "lines", tools: ["trend", "ray", "extended", "arrow", "hline", "hray", "vline", "crossline"] },
  { key: "shapes", tools: ["channel", "rect"] },
  { key: "fib", tools: ["fib", "fibext"] },
  { key: "annot", tools: ["brush", "text"] },
];
const HINT: Partial<Record<ToolId, string>> = { trend: "Alt+T", hline: "Alt+H", vline: "Alt+V", fib: "Alt+F", crossline: "Alt+C", rect: "Alt+R", measure: "Shift+click" };

interface Props { store: DrawingsStore; onTool: () => void; onZoomOut: () => void; count: number }

export default function Toolbar({ store, onTool, onZoomOut, count }: Props) {
  const [open, setOpen] = useState<{ key: string; top: number; left: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ up: false, down: false });
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const up = el.scrollTop > 1, down = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges((e) => (e.up === up && e.down === down ? e : { up, down }));
  }, []);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure]);
  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    setOpen(null);
    el.scrollBy({ top: dir * Math.max(68, el.clientHeight * 0.6), behavior: "smooth" });
  };
  const [last, setLast] = useState<Record<string, ToolId>>(() => Object.fromEntries(GROUPS.map((g) => [g.key, g.tools[0]])));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as Element)?.closest?.(".dt-flyout")) setOpen(null); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (t: ToolId) => { store.setTool(store.tool === t && t !== "cursor" ? "cursor" : t); onTool(); };
  const btn = (t: ToolId, extra?: ReactNode) => (
    <button key={t} className={`dt-btn ${store.tool === t ? "on" : ""}`} title={`${TOOL_LABEL[t]}${HINT[t] ? ` (${HINT[t]})` : ""}`}
            aria-label={TOOL_LABEL[t]} onClick={() => pick(t)}>
      <Icon name={t} />{extra}
    </button>
  );
  const magnetNext = { off: "weak", weak: "strong", strong: "off" } as const;
  const p = store.prefs;

  return (
    <div className="draw-toolbar" ref={ref}>
      {edges.up && <button className="dt-scroll-arrow up" title="Scroll up" aria-label="Scroll tools up" onClick={() => scrollBy(-1)}><Chevron up /></button>}
      <div className="dt-scroll" ref={scroller} onScroll={() => { measure(); setOpen(null); }}>
      <div className="dt-column">
      {btn("cursor")}
      <span className="dt-sep" />
      {GROUPS.map((g) => {
        const cur = g.tools.includes(store.tool) ? store.tool : last[g.key];
        return (
          <div className="dt-group" key={g.key}>
            <button className={`dt-btn ${g.tools.includes(store.tool) ? "on" : ""}`} title={`${TOOL_LABEL[cur]}${HINT[cur] ? ` (${HINT[cur]})` : ""}`}
                    aria-label={TOOL_LABEL[cur]} onClick={() => pick(cur)}><Icon name={cur} /></button>
            <button className="dt-more" title="More tools" aria-label={`More ${g.key} tools`}
                    onClick={(e) => {
                      const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                      setOpen(open?.key === g.key ? null : { key: g.key, top: r.top, left: r.right + 4 });
                    }}><MoreArrow /></button>
            {open?.key === g.key && (
              <div className="dt-flyout" role="menu" style={{ position: "fixed", top: Math.min(open.top, window.innerHeight - 40 * g.tools.length - 16), left: open.left }}>
                {g.tools.map((t) => (
                  <button key={t} className={store.tool === t ? "on" : ""} onClick={() => { setLast((l) => ({ ...l, [g.key]: t })); setOpen(null); store.setTool(t); onTool(); }}>
                    <Icon name={t} /><span>{TOOL_LABEL[t]}</span>{HINT[t] && <kbd>{HINT[t]}</kbd>}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <span className="dt-sep" />
      {btn("measure")}
      {btn("zoom")}
      <button className="dt-btn" title="Zoom out" aria-label="Zoom out" onClick={onZoomOut}><Icon name="zoomout" /></button>
      <span className="dt-sep" />
      <button className={`dt-btn ${p.magnet !== "off" ? "on" : ""}`} title={`Magnet: ${p.magnet} (snaps to open/high/low/close)`} aria-label="Magnet"
              onClick={() => store.setPref("magnet", magnetNext[p.magnet])}>
        <Icon name="magnet" />{p.magnet === "strong" && <i className="dt-badge">S</i>}
      </button>
      <button className={`dt-btn ${p.stay ? "on" : ""}`} title="Stay in drawing mode" aria-label="Stay in drawing mode" onClick={() => store.setPref("stay", !p.stay)}><Icon name="stay" /></button>
      <button className={`dt-btn ${p.lockAll ? "on" : ""}`} title={p.lockAll ? "Unlock all drawings" : "Lock all drawings"} aria-label="Lock all drawings"
              onClick={() => store.setPref("lockAll", !p.lockAll)}><Icon name={p.lockAll ? "lock" : "unlock"} /></button>
      {(() => {
        const hidden = store.items.filter((d) => d.hidden).length;
        const showHidden = !p.hideAll && hidden > 0;
        const title = p.hideAll ? "Show all drawings" : showHidden ? `Show ${hidden} hidden drawing${hidden > 1 ? "s" : ""}` : "Hide all drawings";
        return (
          <button className={`dt-btn ${p.hideAll || showHidden ? "on" : ""}`} title={title} aria-label={title}
                  onClick={() => {
                    if (showHidden) { const before = store.ref.current; store.setItems(before.map((d) => (d.hidden ? { ...d, hidden: false } : d)), before); }
                    else store.setPref("hideAll", !p.hideAll);
                    onTool();
                  }}>
            <Icon name={p.hideAll || showHidden ? "eyeoff" : "eye"} />{showHidden && <i className="dt-badge">{hidden}</i>}
          </button>
        );
      })()}
      <button className="dt-btn" title="Remove all drawings" aria-label="Remove all drawings" disabled={count === 0}
              onClick={() => { if (window.confirm(`Remove all ${count} drawings on this symbol?`)) { store.removeAll(); onTool(); } }}><Icon name="trash" /></button>
      </div>
      </div>
      {edges.down && <button className="dt-scroll-arrow down" title="Scroll down" aria-label="Scroll tools down" onClick={() => scrollBy(1)}><Chevron /></button>}
    </div>
  );
}
