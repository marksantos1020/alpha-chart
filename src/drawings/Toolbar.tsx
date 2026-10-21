import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { TOOL_LABEL, type ToolId } from "./types";
import type { DrawingsStore } from "./useDrawings";
import { CURSORS, GROUPS, HINT, ICONS } from "./tools";
import { ToolIcon } from "./toolIcons";

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

export interface IndicatorControls { count: number; hidden: boolean; onHide: (hidden: boolean) => void; onRemove: () => void }

interface Props { store: DrawingsStore; onTool: () => void; onZoomOut: () => void; count: number; indicators?: IndicatorControls }

function Flyout({ label, top, left, wide, children }: { label: string; top: number; left: number; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(top);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    setY(Math.max(8, Math.min(top, window.innerHeight - h - 8)));
  }, [top]);
  return <div ref={ref} className={`dt-flyout${wide ? " wide" : ""}`} role="menu" aria-label={label} style={{ position: "fixed", top: y, left }}>{children}</div>;
}

export default function Toolbar({ store, onTool, onZoomOut, count, indicators }: Props) {
  const [open, setOpen] = useState<{ key: string; top: number; left: number } | null>(null);
  const [tip, setTip] = useState<{ text: string; hint?: string; top: number; left: number } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!(e.target as Element)?.closest?.(".dt-flyout, .dt-group.open .dt-more")) setOpen(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(null); } };
    const close = () => setOpen(null);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [open]);
  useEffect(() => setOpen(null), [store.tool]);
  useEffect(() => () => { if (tipTimer.current) clearTimeout(tipTimer.current); }, []);

  const hideTip = () => { if (tipTimer.current) clearTimeout(tipTimer.current); tipTimer.current = null; setTip(null); };
  const onOver = (e: ReactMouseEvent) => {
    const el = (e.target as Element).closest?.("[data-tip]") as HTMLElement | null;
    if (!el || el.closest(".dt-flyout")) return;
    hideTip();
    tipTimer.current = setTimeout(() => {
      const r = el.getBoundingClientRect(), bar = ref.current?.getBoundingClientRect();
      setTip({ text: el.dataset.tip!, hint: el.dataset.hint, top: r.top + r.height / 2, left: (bar?.right ?? r.right) + 6 });
    }, 450);
  };

  const p = store.prefs;
  const pick = (t: ToolId) => { store.setTool(store.tool === t && t !== "cursor" ? "cursor" : t); onTool(); };
  const choose = (t: ToolId, group?: string) => {
    if (group) store.setPref("recent", { ...p.recent, [group]: t });
    setOpen(null); store.setTool(t); onTool();
  };
  const toggleFav = (t: ToolId) => store.setPref("favorites", p.favorites.includes(t) ? p.favorites.filter((x) => x !== t) : [...p.favorites, t]);
  const toggle = (key: string, target: HTMLElement) => {
    hideTip();
    const r = (target.parentElement as HTMLElement).getBoundingClientRect(), bar = ref.current?.getBoundingClientRect();
    setOpen(open?.key === key ? null : { key, top: r.top, left: (bar?.right ?? r.right) + 4 });
  };

  const tipOf = (t: ToolId) => ({ "data-tip": TOOL_LABEL[t], "data-hint": HINT[t] });
  const btn = (t: ToolId) => (
    <button key={t} className={`dt-btn ${store.tool === t ? "on" : ""}`} aria-label={TOOL_LABEL[t]} {...tipOf(t)} onClick={() => pick(t)}>
      <ToolIcon name={t} />
    </button>
  );
  const group = (key: string, label: string, main: ReactNode, menu: () => ReactNode, wide = false) => (
    <div className={`dt-group ${open?.key === key ? "open" : ""}`} key={key}>
      {main}
      <button className="dt-more" aria-label={label} data-tip={label} aria-haspopup="menu" aria-expanded={open?.key === key}
              onClick={(e) => toggle(key, e.currentTarget)}><MoreArrow /></button>
      {open?.key === key && <Flyout label={label} top={open.top} left={open.left} wide={wide}>{menu()}</Flyout>}
    </div>
  );
  const item = (key: string, icon: ReactNode, label: string, on: boolean, act: () => void, extra?: ReactNode, disabled = false) => (
    <div key={key} role="menuitem" aria-label={label} aria-disabled={disabled || undefined} tabIndex={-1} className={`dt-item ${on ? "on" : ""}`}
         onClick={() => { if (!disabled) act(); }}
         onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); act(); } }}>
      {icon}<span>{label}</span>{extra}
    </div>
  );
  const toolItem = (t: ToolId, g?: string) => {
    const fav = p.favorites.includes(t);
    return item(t, <ToolIcon name={t} />, TOOL_LABEL[t], store.tool === t, () => choose(t, g), <>
      {HINT[t] && <kbd>{HINT[t]}</kbd>}
      <button className={`dt-fav ${fav ? "on" : ""}`} aria-label={fav ? `Remove ${TOOL_LABEL[t]} from favorites` : `Add ${TOOL_LABEL[t]} to favorites`}
              onClick={(e) => { e.stopPropagation(); toggleFav(t); }}><ToolIcon name={fav ? "star_on" : "star"} size={20} /></button>
    </>);
  };

  const cursorShown = store.tool === "eraser" ? { label: "Eraser", icon: "eraser" } : CURSORS.find((c) => c.kind === p.cursor) ?? CURSORS[0];
  const magnetOn = p.magnet !== "off";
  const hidden = store.items.filter((d) => d.hidden).length;
  const indHidden = !!indicators?.hidden;
  const hide = (() => {
    const mode = indicators ? p.hideMode : "drawings";
    if (mode === "indicators") return { on: indHidden, label: indHidden ? "Show indicators" : "Hide indicators", act: () => indicators!.onHide(!indHidden) };
    if (mode === "all") {
      const all = p.hideAll && indHidden;
      return { on: all, label: all ? "Show drawings & indicators" : "Hide drawings & indicators", act: () => { store.setPref("hideAll", !all); indicators!.onHide(!all); onTool(); } };
    }
    const showHidden = !p.hideAll && hidden > 0;
    return {
      on: p.hideAll || showHidden, badge: showHidden ? hidden : undefined,
      label: p.hideAll ? "Show all drawings" : showHidden ? `Show ${hidden} hidden drawing${hidden > 1 ? "s" : ""}` : "Hide all drawings",
      act: () => {
        if (showHidden) { const before = store.ref.current; store.setItems(before.map((d) => (d.hidden ? { ...d, hidden: false } : d)), before); }
        else store.setPref("hideAll", !p.hideAll);
        onTool();
      },
    };
  })();
  const setHide = (mode: "drawings" | "indicators" | "all") => {
    setOpen(null);
    store.setPref("hideMode", mode);
    if (mode !== "indicators") store.setPref("hideAll", true);
    if (mode !== "drawings") indicators?.onHide(true);
    onTool();
  };
  const removeDrawings = () => { if (count > 0 && window.confirm(`Remove all ${count} drawings on this symbol?`)) { store.removeAll(); onTool(); } };
  const removeIndicators = () => { if (indicators && indicators.count > 0 && window.confirm(`Remove all ${indicators.count} indicators?`)) indicators.onRemove(); };

  return (
    <div className="draw-toolbar" ref={ref} onMouseOver={onOver} onMouseLeave={hideTip} onMouseDown={hideTip}>
      {edges.up && <button className="dt-scroll-arrow up" aria-label="Scroll tools up" onClick={() => scrollBy(-1)}><Chevron up /></button>}
      <div className="dt-scroll" ref={scroller} onScroll={() => { measure(); setOpen(null); hideTip(); }}>
      <div className="dt-column">
      {group("cursors", "Cursors",
        <button className={`dt-btn ${store.tool === "cursor" || store.tool === "eraser" ? "on" : ""}`} aria-label={cursorShown.label} data-tip={cursorShown.label}
                onClick={() => { store.setTool(store.tool === "eraser" ? "eraser" : "cursor"); onTool(); }}><ToolIcon name={cursorShown.icon} /></button>,
        () => <>
          {CURSORS.map((c) => item(c.kind, <ToolIcon name={c.icon} />, c.label, store.tool === "cursor" && p.cursor === c.kind,
                                   () => { store.setPref("cursor", c.kind); choose("cursor"); }))}
          <hr />
          {item("eraser", <ToolIcon name="eraser" />, "Eraser", store.tool === "eraser", () => choose("eraser"))}
        </>)}
      {GROUPS.map((g) => {
        const all = g.sections.flatMap((s) => s.tools);
        const recent = p.recent[g.key];
        const cur = all.includes(store.tool as never) ? store.tool : recent && all.includes(recent as never) ? recent : all[0];
        return group(g.key, g.label,
          <button className={`dt-btn ${all.includes(store.tool as never) ? "on" : ""}`} aria-label={TOOL_LABEL[cur]} {...tipOf(cur)} onClick={() => pick(cur)}>
            <ToolIcon name={cur} />
          </button>,
          () => g.sections.map((s) => (
            <div key={s.title} className="dt-section">
              <div className="dt-section-title">{s.title}</div>
              {s.tools.map((t) => toolItem(t, g.key))}
            </div>
          )));
      })}
      {group("icons", "Icons",
        <button className={`dt-btn ${store.tool === "icon" ? "on" : ""}`} aria-label="Icon" data-tip="Icon" onClick={() => pick("icon")}>
          <span className="dt-emoji">{p.icon}</span>
        </button>,
        () => (
          <div className="dt-emoji-grid">
            {ICONS.map((e) => (
              <button key={e} role="menuitem" className={p.icon === e && store.tool === "icon" ? "on" : ""} aria-label={`Icon ${e}`}
                      onClick={() => { store.setPref("icon", e); choose("icon"); }}>{e}</button>
            ))}
          </div>
        ), true)}
      <span className="dt-sep" />
      {btn("measure")}
      {btn("zoom")}
      <button className="dt-btn" aria-label="Zoom out" data-tip="Zoom out" onClick={onZoomOut}><ToolIcon name="zoomout" /></button>
      <span className="dt-sep" />
      {group("magnet", "Magnet modes",
        <button className={`dt-btn ${magnetOn ? "on" : ""}`} aria-label="Magnet" aria-pressed={magnetOn}
                data-tip={magnetOn ? `${p.magnet === "strong" ? "Strong" : "Weak"} magnet` : "Magnet"} data-hint="Ctrl inverts while drawing"
                onClick={() => store.setPref("magnet", magnetOn ? "off" : p.magnetMode)}><ToolIcon name={(magnetOn ? p.magnet : p.magnetMode) === "strong" ? "magnet_strong" : "magnet"} /></button>,
        () => (["weak", "strong"] as const).map((m) => item(m, <ToolIcon name={m === "strong" ? "magnet_strong" : "magnet"} />,
          m === "weak" ? "Weak magnet" : "Strong magnet", p.magnet === m, () => { setOpen(null); store.setPref("magnetMode", m); store.setPref("magnet", m); }))
      )}
      <button className={`dt-btn ${p.stay ? "on" : ""}`} aria-label="Stay in drawing mode" aria-pressed={p.stay} data-tip="Stay in drawing mode"
              onClick={() => store.setPref("stay", !p.stay)}><ToolIcon name="stay" /></button>
      <button className={`dt-btn ${p.lockAll ? "on" : ""}`} aria-label="Lock all drawings" aria-pressed={p.lockAll} data-tip={p.lockAll ? "Unlock all drawings" : "Lock all drawings"}
              onClick={() => store.setPref("lockAll", !p.lockAll)}><ToolIcon name={p.lockAll ? "lock" : "unlock"} /></button>
      {(() => {
        const main = (
          <button className={`dt-btn ${hide.on ? "on" : ""}`} aria-label={hide.label} data-tip={hide.label} onClick={hide.act}>
            <ToolIcon name={hide.on ? "eyeoff" : "eye"} />{hide.badge !== undefined && <i className="dt-badge">{hide.badge}</i>}
          </button>
        );
        if (!indicators) return main;
        return group("hide", "Hide options", main, () => <>
          {item("drawings", <ToolIcon name="eye" />, "Hide drawings", p.hideMode === "drawings", () => setHide("drawings"))}
          {item("indicators", <ToolIcon name="hide_ind" />, "Hide indicators", p.hideMode === "indicators", () => setHide("indicators"))}
          {item("all", <ToolIcon name="eyeoff" />, "Hide drawings & indicators", p.hideMode === "all", () => setHide("all"))}
        </>);
      })()}
      {(() => {
        const main = (
          <button className="dt-btn" aria-label="Remove all drawings" data-tip="Remove drawings" disabled={count === 0} onClick={removeDrawings}>
            <ToolIcon name="trash" />
          </button>
        );
        if (!indicators) return main;
        return group("remove", "Remove options", main, () => <>
          {item("drawings", <ToolIcon name="trash" />, `Remove ${count} drawing${count === 1 ? "" : "s"}`, false, () => { setOpen(null); removeDrawings(); }, undefined, count === 0)}
          {item("indicators", <ToolIcon name="hide_ind" />, `Remove ${indicators.count} indicator${indicators.count === 1 ? "" : "s"}`, false, () => { setOpen(null); removeIndicators(); }, undefined, indicators.count === 0)}
          {item("all", <ToolIcon name="trash" />, "Remove drawings & indicators", false, () => {
            setOpen(null);
            if (window.confirm(`Remove ${count} drawings and ${indicators.count} indicators?`)) { store.removeAll(); indicators.onRemove(); onTool(); }
          }, undefined, count === 0 && indicators.count === 0)}
        </>);
      })()}
      <span className="dt-sep" />
      <button className={`dt-btn ${p.showFavorites && p.favorites.length ? "on" : ""}`} aria-label="Favorite drawing tools toolbar" aria-pressed={p.showFavorites}
              data-tip={p.favorites.length ? `${p.showFavorites ? "Hide" : "Show"} favorite drawing tools toolbar` : "Star tools in the menus to add favorites"}
              disabled={p.favorites.length === 0} onClick={() => store.setPref("showFavorites", !p.showFavorites)}><ToolIcon name="star" /></button>
      </div>
      </div>
      {edges.down && <button className="dt-scroll-arrow down" aria-label="Scroll tools down" onClick={() => scrollBy(1)}><Chevron /></button>}
      {tip && !open && (
        <div className="dt-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>{tip.text}{tip.hint && <kbd>{tip.hint}</kbd>}</div>
      )}
    </div>
  );
}
