import type { ISeriesApi, ISeriesPrimitive, ISeriesPrimitiveAxisView, SeriesAttachedParameter, SeriesType, Time } from "lightweight-charts";

export interface CountdownSource {
  mode(): "off" | "time" | "blocks";
  bar(): { end: number; close: number; up: boolean } | null;
  colors(): { up: string; down: string };
  /** Block clock for the "blocks" mode (chains whose bars close on a block). */
  block?(): BlockClock | undefined;
}

/** A chain's block time, for counting down to the bar close in blocks. */
export interface BlockClock { ms: number; name?: string }

export function countdownText(msLeft: number, mode: "time" | "blocks", block?: BlockClock): string {
  const blocks = mode === "blocks" && !!block;
  if (msLeft <= 0) return blocks ? "closing" : "00:00";
  if (blocks) { const b = Math.ceil(msLeft / block.ms), n = block.name ?? "block"; return `${b} ${n}${b === 1 ? "" : "s"}`; }
  const s = Math.ceil(msLeft / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

class Label implements ISeriesPrimitiveAxisView {
  constructor(private c: number, private t: string, private bg: string) {}
  coordinate() { return this.c; }
  text() { return this.t; }
  textColor() { return "#ffffff"; }
  backColor() { return this.bg; }
  visible() { return true; }
  tickVisible() { return false; }
}

export class Countdown implements ISeriesPrimitive<Time> {
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private views: Label[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private src: CountdownSource) {}

  attached(p: SeriesAttachedParameter<Time>) {
    this.series = p.series; this.request = p.requestUpdate;
    this.timer = setInterval(() => this.request?.(), 1000);
  }
  detached() { if (this.timer) clearInterval(this.timer); this.timer = null; this.series = null; this.request = null; }
  paneViews() { return []; }
  priceAxisViews() { return this.views; }

  updateAllViews() {
    this.views = [];
    const mode = this.src.mode(), bar = this.src.bar();
    if (mode === "off" || !bar || !this.series) return;
    const y = this.series.priceToCoordinate(bar.close);
    if (y === null) return;
    const c = this.src.colors();
    this.views = [new Label(y + 18, countdownText(bar.end - Date.now(), mode, this.src.block?.()), bar.up ? c.up : c.down)];
  }
}
