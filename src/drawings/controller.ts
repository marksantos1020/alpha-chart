import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { fmtNum } from "../format";
import { logicalToTime, snapAngle, snapTime, timeToLogical, type Bars, type Pt, type Timeline } from "./geometry";
import { DrawingLayer, type MeasureInfo } from "./layer";
import { hitTest, moveHandle } from "./paint";
import { SHORTCUTS } from "./tools";
import { ANCHORS, ANGLE_SNAP_TYPES, defaultStyle, FREEHAND, OPEN, TEXT_TYPES, type Anchor, type Drawing, type DrawingType } from "./types";
import type { DrawingsStore } from "./useDrawings";
import { uid } from "../uid";

export type { Bars };

export interface ControllerHost {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  el: HTMLElement;
  store: () => DrawingsStore;
  timeline: () => Timeline;
  bars: () => Bars;
  openSettings: (id: string) => void;
  openMenu: (id: string, clientX: number, clientY: number) => void;
  editText: (id: string) => void;
  volumeUnit?: () => string;
}

type Mode =
  | { kind: "idle" }
  | { kind: "creating"; d: Drawing; placed: number; down: Pt; downTime: number }
  | { kind: "brushing"; d: Drawing }
  | { kind: "dragAnchor"; id: string; index: number; before: Drawing[] }
  | { kind: "dragBody"; id: string; start: Pt; startL: number; startPrice: number; anchors: { l: number; price: number }[]; before: Drawing[] }
  | { kind: "measuring"; a: Anchor; b: Anchor; active: boolean }
  | { kind: "zooming"; a: Anchor; b: Anchor };

const MAGNET_PX = 12;

export class DrawingController {
  readonly layer: DrawingLayer;
  hover: string | null = null;
  private mode: Mode = { kind: "idle" };
  private preview: Drawing | null = null;
  private measure: MeasureInfo | null = null;
  private inside = false;
  private finishedAt = 0;
  private off: (() => void)[] = [];

  constructor(private h: ControllerHost) {
    const self = this;
    this.layer = new DrawingLayer({
      drawings: () => self.h.store().ref.current,
      selectedId: () => self.h.store().selRef.current,
      hoverId: () => self.hover,
      preview: () => self.preview,
      measure: () => self.measure,
      hideAll: () => self.h.store().prefsRef.current.hideAll,
      timeline: () => self.h.timeline(),
      bars: () => self.h.bars(),
      volumeUnit: () => self.h.volumeUnit?.() ?? "",
      formatPrice: (p) => self.h.series.priceFormatter().format(p),
      pointerInside: () => self.inside,
    });
    h.series.attachPrimitive(this.layer);
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener, { capture: true });
      this.off.push(() => target.removeEventListener(type, fn as EventListener, { capture: true }));
    };
    on(h.el, "mousedown", (e) => this.onDown(e));
    on(window, "mousemove", (e) => this.onMove(e));
    on(window, "mouseup", (e) => this.onUp(e));
    on(h.el, "dblclick", (e) => this.onDbl(e));
    on(h.el, "contextmenu", (e) => this.onContext(e));
    on(window, "mouseout", (e) => { if (!(e as MouseEvent).relatedTarget) this.setInside(false); });
    on(window, "keydown", (e) => this.onKey(e as KeyboardEvent));
  }

  destroy() {
    for (const f of this.off) f();
    this.off = [];
    try { this.h.series.detachPrimitive(this.layer); } catch {}
  }

  measureState(): { active: boolean; a: Anchor; b: Anchor } | null {
    const m = this.mode;
    return m.kind === "measuring" ? { active: m.active, a: m.a, b: m.b } : null;
  }

  refresh() { this.layer.requestUpdate(); this.updateCursor(); }

  toolChanged() {
    if (this.mode.kind === "creating" || this.mode.kind === "brushing") this.cancel();
    this.measure = this.h.store().toolRef.current === "measure" ? this.measure : null;
    this.refresh();
  }

  private local(e: MouseEvent): { p: Pt; inPlot: boolean; w: number; h: number } | null {
    const pane = this.h.chart.panes()[0];
    const row = pane?.getHTMLElement();
    if (!row) return null;
    const r = row.getBoundingClientRect();
    let left = 0;
    try { left = this.h.chart.priceScale("left").width(); } catch {}
    const p = { x: e.clientX - r.left - left, y: e.clientY - r.top };
    const w = this.h.chart.timeScale().width(), hh = pane.getHeight();
    return { p, inPlot: p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= hh, w, h: hh };
  }

  private logicalAt(x: number): number | null {
    const ts = this.h.chart.timeScale();
    const x0 = ts.logicalToCoordinate(0 as never), x1 = ts.logicalToCoordinate(1 as never);
    if (x0 === null || x1 === null || x1 === x0) return null;
    return (x - x0) / (x1 - x0);
  }

  private toPx = (a: Anchor): Pt => this.layer.toPx(a) ?? { x: -1e6, y: -1e6 };

  private anchorAt(p: Pt, opts: { snapBar?: boolean; magnet?: boolean } = {}): Anchor | null {
    const l = this.logicalAt(p.x);
    const price = this.h.series.coordinateToPrice(p.y);
    if (l === null || price === null) return null;
    const tl = this.h.timeline();
    const snapBar = opts.snapBar !== false;
    const a: Anchor = { time: snapBar ? snapTime(tl, l) : logicalToTime(tl, l), price: price as number };
    const mode = this.h.store().prefsRef.current.magnet;
    if (opts.magnet && mode !== "off") {
      const b = this.h.bars(), i = Math.round(l);
      if (i >= 0 && i < b.times.length) {
        let best: number = price, bestPx = Infinity;
        for (const v of [b.open[i], b.high[i], b.low[i], b.close[i]]) {
          const y = this.h.series.priceToCoordinate(v);
          if (y !== null && Math.abs(y - p.y) < bestPx) { bestPx = Math.abs(y - p.y); best = v; }
        }
        if (mode === "strong" || bestPx <= MAGNET_PX) a.price = best;
      }
    }
    return a;
  }

  private hit(p: Pt, w: number, h: number) {
    const s = this.h.store();
    if (s.prefsRef.current.hideAll) return null;
    return hitTest(s.ref.current, p, this.layer.env(w, h), s.selRef.current);
  }

  private swallow(e: Event) { e.preventDefault(); e.stopPropagation(); }

  private onDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const loc = this.local(e);
    if (!loc || !loc.inPlot) return;
    const s = this.h.store();
    const tool = s.toolRef.current;
    if (this.mode.kind === "measuring" && this.mode.active) {
      const m = this.mode;
      const b = this.anchorAt(loc.p, { magnet: true });
      if (b) { m.b = b; this.measure = this.measureInfo(m.a, b); }
      m.active = false;
      if (tool === "measure") s.setTool("cursor");
      this.swallow(e); this.refresh();
      return;
    }
    if (this.mode.kind === "measuring" && !this.mode.active) { this.measure = null; this.mode = { kind: "idle" }; this.refresh(); if (tool !== "measure") { this.swallow(e); return; } }

    if (this.mode.kind === "creating") {
      const m = this.mode;
      const a = this.anchorAt(this.shiftSnap(m, loc.p, e.shiftKey), { magnet: !e.ctrlKey });
      if (!a) return;
      if (ANCHORS[m.d.type] === OPEN) {
        const last = this.toPx(m.d.anchors[m.placed - 1]);
        if (Math.hypot(last.x - loc.p.x, last.y - loc.p.y) <= 4) { if (m.placed >= 2) this.finishOpen(m); }
        else { m.d.anchors[m.placed] = a; m.placed += 1; m.d.anchors.push({ ...a }); }
        this.swallow(e); this.refresh();
        return;
      }
      m.d.anchors[m.placed] = a;
      m.placed += 1;
      if (m.placed >= ANCHORS[m.d.type]) this.finish(m.d);
      else { for (let i = m.placed; i < m.d.anchors.length; i++) m.d.anchors[i] = a; m.down = loc.p; m.downTime = Date.now(); }
      this.swallow(e); this.refresh();
      return;
    }

    if (tool === "measure" || (tool === "cursor" && e.shiftKey)) {
      const a = this.anchorAt(loc.p, { magnet: true });
      if (!a) return;
      this.mode = { kind: "measuring", a, b: a, active: true };
      this.measure = this.measureInfo(a, a);
      this.swallow(e); this.refresh();
      return;
    }
    if (tool === "zoom") {
      const a = this.anchorAt(loc.p);
      if (!a) return;
      this.mode = { kind: "zooming", a, b: a };
      this.swallow(e);
      return;
    }
    if (tool === "eraser") {
      const hit = this.hit(loc.p, loc.w, loc.h);
      const d = hit && s.ref.current.find((x) => x.id === hit.id);
      if (d && !d.locked && !s.prefsRef.current.lockAll) { s.remove(d.id); this.hover = null; }
      this.swallow(e); this.refresh();
      return;
    }
    if (tool !== "cursor") { this.startCreate(tool, loc.p, e); return; }

    const hit = this.hit(loc.p, loc.w, loc.h);
    if (!hit) {
      if (s.selRef.current) { s.select(null); this.refresh(); }
      return;
    }
    s.select(hit.id);
    const d = s.ref.current.find((x) => x.id === hit.id)!;
    const locked = s.prefsRef.current.lockAll || !!d.locked;
    this.refresh();
    if (locked) { this.swallow(e); return; }
    const before = s.ref.current;
    if (hit.handle !== null) {
      this.mode = { kind: "dragAnchor", id: d.id, index: hit.handle, before };
    } else {
      let target = d;
      if (e.ctrlKey || e.metaKey) {
        target = { ...structuredClone(d), id: uid() };
        s.setItems([...before, target]);
        s.select(target.id);
      }
      const tl = this.h.timeline();
      this.mode = {
        kind: "dragBody", id: target.id, start: loc.p,
        startL: this.logicalAt(loc.p.x) ?? 0, startPrice: this.h.series.coordinateToPrice(loc.p.y) ?? 0,
        anchors: target.anchors.map((a) => ({ l: timeToLogical(tl, a.time), price: a.price })), before,
      };
    }
    this.h.el.classList.add("draw-dragging");
    this.swallow(e);
  }

  private startCreate(tool: DrawingType, p: Pt, e: MouseEvent) {
    const need = ANCHORS[tool];
    const a = this.anchorAt(p, { magnet: !e.ctrlKey, snapBar: need !== FREEHAND });
    if (!a) return;
    const d: Drawing = { id: uid(), type: tool, anchors: [a], style: defaultStyle(tool) };
    if (tool === "icon") d.style.text = this.h.store().prefsRef.current.icon;
    this.swallow(e);
    if (need === FREEHAND) { this.mode = { kind: "brushing", d }; this.preview = d; this.refresh(); return; }
    if (tool === "long" || tool === "short") { d.anchors = this.seedPosition(tool, a, p); this.finish(d); return; }
    if (need === 1) { this.finish(d); return; }
    d.anchors = Array.from({ length: need === OPEN ? 2 : need }, () => ({ ...a }));
    this.mode = { kind: "creating", d, placed: 1, down: p, downTime: Date.now() };
    this.preview = d;
    this.refresh();
  }

  private seedPosition(tool: "long" | "short", a: Anchor, p: Pt): Anchor[] {
    const pane = this.h.chart.panes()[0]?.getHeight() ?? 400;
    const up = this.h.series.coordinateToPrice(p.y - pane * 0.12), dn = this.h.series.coordinateToPrice(p.y + pane * 0.06);
    const hi = up === null ? a.price * 1.03 : (up as number), lo = dn === null ? a.price * 0.985 : (dn as number);
    const l = this.logicalAt(p.x) ?? 0, end = snapTime(this.h.timeline(), l + 24);
    const target = tool === "long" ? hi : 2 * a.price - hi, stop = tool === "long" ? lo : 2 * a.price - lo;
    return [a, { time: end, price: target }, { time: end, price: stop }];
  }

  private finishOpen(m: Extract<Mode, { kind: "creating" }>) {
    const pts = m.d.anchors.slice(0, m.placed);
    if (pts.length < 2) { this.cancel(); return; }
    this.finish({ ...m.d, anchors: pts });
  }

  private shiftSnap(m: Extract<Mode, { kind: "creating" }>, p: Pt, shift: boolean): Pt {
    if (!shift || !ANGLE_SNAP_TYPES.has(m.d.type)) return p;
    return snapAngle(this.toPx(m.d.anchors[m.placed - 1]), p);
  }

  private finish(d: Drawing) {
    const s = this.h.store();
    const before = s.ref.current;
    const done: Drawing = { ...d, anchors: d.anchors.map((a) => ({ ...a })) };
    s.setItems([...before, done], before);
    s.select(done.id);
    this.preview = null;
    this.mode = { kind: "idle" };
    this.finishedAt = Date.now();
    if (!s.prefsRef.current.stay) s.setTool("cursor");
    if (TEXT_TYPES.has(d.type) && d.style.text) this.h.editText(done.id);
    this.refresh();
  }

  private cancel() {
    this.preview = null;
    this.mode = { kind: "idle" };
    this.refresh();
  }

  private setInside(v: boolean) {
    if (v === this.inside) return;
    this.inside = v;
    if (this.measure) this.refresh();
  }

  private onMove(e: MouseEvent) {
    const r = this.h.el.getBoundingClientRect();
    this.setInside(e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom);
    const loc = this.local(e);
    if (!loc) return;
    const s = this.h.store();
    const m = this.mode;
    switch (m.kind) {
      case "creating": {
        const a = this.anchorAt(this.shiftSnap(m, loc.p, e.shiftKey), { magnet: !e.ctrlKey });
        if (a) for (let i = m.placed; i < m.d.anchors.length; i++) m.d.anchors[i] = a;
        this.refresh();
        return;
      }
      case "brushing": {
        const a = this.anchorAt(loc.p, { snapBar: false });
        const last = m.d.anchors[m.d.anchors.length - 1];
        if (a && (Math.abs(this.toPx(last).x - loc.p.x) > 2 || Math.abs(this.toPx(last).y - loc.p.y) > 2)) m.d.anchors.push(a);
        this.refresh();
        return;
      }
      case "dragAnchor": {
        const a = this.anchorAt(loc.p, { magnet: !e.ctrlKey });
        if (!a) return;
        s.setItems(s.ref.current.map((d) => (d.id === m.id ? { ...d, anchors: moveHandle(d, m.index, a) } : d)));
        this.refresh();
        return;
      }
      case "dragBody": {
        const l = this.logicalAt(loc.p.x), price = this.h.series.coordinateToPrice(loc.p.y);
        if (l === null || price === null) return;
        const dl = Math.round(l - m.startL), dp = price - m.startPrice, tl = this.h.timeline();
        s.setItems(s.ref.current.map((d) => (d.id === m.id ? {
          ...d, anchors: m.anchors.map((x) => ({ time: d.type === "hline" ? d.anchors[0].time : logicalToTime(tl, x.l + dl), price: x.price + dp })),
        } : d)));
        this.refresh();
        return;
      }
      case "measuring": {
        if (!m.active) return;
        const b = this.anchorAt(loc.p, { magnet: true });
        if (b) { m.b = b; this.measure = this.measureInfo(m.a, b); this.refresh(); }
        return;
      }
      case "zooming": {
        const b = this.anchorAt(loc.p);
        if (b) { m.b = b; this.measure = { a: m.a, b, lines: [], up: true }; this.refresh(); }
        return;
      }
      default: {
        if (!loc.inPlot) { if (this.hover) { this.hover = null; this.refresh(); } return; }
        const hit = s.toolRef.current === "cursor" || s.toolRef.current === "eraser" ? this.hit(loc.p, loc.w, loc.h) : null;
        const id = hit?.id ?? null;
        if (id !== this.hover) { this.hover = id; this.refresh(); }
      }
    }
  }

  private onUp(e: MouseEvent) {
    const m = this.mode;
    const s = this.h.store();
    if (m.kind === "creating") {
      const loc = this.local(e);
      if (loc && m.placed === 1 && ANCHORS[m.d.type] === 2 && Math.hypot(loc.p.x - m.down.x, loc.p.y - m.down.y) > 6 && Date.now() - m.downTime > 120) {
        const a = this.anchorAt(this.shiftSnap(m, loc.p, e.shiftKey), { magnet: !e.ctrlKey });
        if (a) { m.d.anchors[1] = a; this.finish(m.d); }
      }
      return;
    }
    if (m.kind === "brushing") {
      if (m.d.anchors.length > 1) this.finish(m.d); else this.cancel();
      return;
    }
    if (m.kind === "dragAnchor" || m.kind === "dragBody") {
      const after = s.ref.current;
      if (after !== m.before) s.setItems(after, m.before);
      this.mode = { kind: "idle" };
      this.h.el.classList.remove("draw-dragging");
      this.refresh();
      return;
    }
    if (m.kind === "measuring") return;
    if (m.kind === "zooming") {
      const tl = this.h.timeline();
      const la = timeToLogical(tl, m.a.time), lb = timeToLogical(tl, m.b.time);
      if (Math.abs(lb - la) >= 3) this.h.chart.timeScale().setVisibleLogicalRange({ from: Math.min(la, lb), to: Math.max(la, lb) });
      this.measure = null;
      this.mode = { kind: "idle" };
      s.setTool("cursor");
      this.refresh();
    }
  }

  private onDbl(e: MouseEvent) {
    if (this.mode.kind === "creating" && ANCHORS[this.mode.d.type] === OPEN) { this.finishOpen(this.mode); this.swallow(e); return; }
    const loc = this.local(e);
    if (!loc?.inPlot || this.mode.kind !== "idle" || Date.now() - this.finishedAt < 500) return;
    const hit = this.hit(loc.p, loc.w, loc.h);
    if (!hit) return;
    const d = this.h.store().ref.current.find((x) => x.id === hit.id);
    if (d?.type === "text") this.h.editText(hit.id); else this.h.openSettings(hit.id);
    this.swallow(e);
  }

  private onContext(e: MouseEvent) {
    if (this.mode.kind === "creating" && ANCHORS[this.mode.d.type] === OPEN) { this.finishOpen(this.mode); this.swallow(e); return; }
    if (this.mode.kind === "creating" || this.mode.kind === "brushing") { this.cancel(); this.swallow(e); return; }
    const loc = this.local(e);
    if (!loc?.inPlot) return;
    const hit = this.hit(loc.p, loc.w, loc.h);
    if (!hit) return;
    this.h.store().select(hit.id);
    this.refresh();
    this.h.openMenu(hit.id, e.clientX, e.clientY);
    this.swallow(e);
  }

  private onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable || t.closest(".cm-editor, .modal"))) return;
    const s = this.h.store();
    if ((e.key === "Escape" || e.key === "Enter") && this.mode.kind === "creating" && ANCHORS[this.mode.d.type] === OPEN) { this.finishOpen(this.mode); return; }
    if (e.key === "Escape") {
      if (this.mode.kind !== "idle" || this.measure) { this.measure = null; this.cancel(); }
      else if (s.toolRef.current !== "cursor") s.setTool("cursor");
      else if (s.selRef.current) { s.select(null); this.refresh(); }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && s.selRef.current) {
      const d = s.ref.current.find((x) => x.id === s.selRef.current);
      if (d && !d.locked && !s.prefsRef.current.lockAll) { s.remove(d.id); this.hover = null; this.refresh(); e.preventDefault(); }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (e.key === "z" || e.key === "Z")) { if (e.shiftKey) s.redo(); else s.undo(); e.preventDefault(); this.refresh(); return; }
    if (mod && !e.altKey && (e.key === "y" || e.key === "Y")) { s.redo(); e.preventDefault(); this.refresh(); return; }
    if (e.altKey && !mod) {
      const tool = SHORTCUTS[e.key.toLowerCase()];
      if (tool) { s.setTool(tool); this.toolChanged(); e.preventDefault(); }
    }
  }

  private measureInfo(a: Anchor, b: Anchor): MeasureInfo {
    const tl = this.h.timeline(), bars = this.h.bars();
    const la = timeToLogical(tl, a.time), lb = timeToLogical(tl, b.time);
    const dp = b.price - a.price, pct = a.price ? (dp / a.price) * 100 : 0;
    const n = Math.round(lb - la);
    const span = Math.abs(b.time - a.time);
    const days = Math.floor(span / 86_400_000), hours = Math.floor((span % 86_400_000) / 3_600_000), mins = Math.round((span % 3_600_000) / 60_000);
    const spanText = days ? `${days}d ${hours}h` : hours ? `${hours}h ${mins}m` : `${mins}m`;
    let vol = 0;
    const i0 = Math.max(0, Math.ceil(Math.min(la, lb))), i1 = Math.min(bars.volume.length - 1, Math.floor(Math.max(la, lb)));
    for (let i = i0; i <= i1; i++) vol += bars.volume[i] || 0;
    const fmt = (v: number) => this.h.series.priceFormatter().format(v);
    return {
      a, b, up: dp >= 0,
      lines: [`${dp >= 0 ? "+" : "−"}${fmt(Math.abs(dp))} (${dp >= 0 ? "+" : ""}${pct.toFixed(2)}%)`, `${n} bars, ${spanText}`, `Vol ${fmtNum(vol, 2)}${this.h.volumeUnit?.() ? ` ${this.h.volumeUnit()}` : ""}`],
    };
  }

  private updateCursor() {
    const s = this.h.store(), el = this.h.el;
    const tool = s.toolRef.current, cursor = s.prefsRef.current.cursor;
    el.classList.toggle("draw-pointer", !!this.hover && tool === "cursor");
    el.classList.toggle("draw-eraser", tool === "eraser");
    el.classList.toggle("draw-erasing", tool === "eraser" && !!this.hover);
    el.classList.toggle("draw-tool", tool !== "cursor" && tool !== "eraser");
    el.classList.toggle("cursor-dot", tool === "cursor" && cursor === "dot");
    el.classList.toggle("cursor-arrow", tool === "cursor" && cursor === "arrow");
  }
}
