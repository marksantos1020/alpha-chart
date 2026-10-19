import type {
  IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesPrimitive, PrimitivePaneViewZOrder, SeriesAttachedParameter, Time,
} from "lightweight-charts";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export interface ValueLabel {
  y: number;
  text: string;
  color: string;
  filled?: boolean;
  fixed?: boolean;
  sub?: string;
}

export interface ValueLabelsSource {
  labels(): ValueLabel[];
  background(): string;
  ticking?: boolean;
}

const TEXT_X = 10, BOX_X = 0, PAD_Y = 3, GAP = 1, RADIUS = 2;

export function labelHeight(fontSize: number, twoLines: boolean): number {
  return twoLines ? fontSize * 2 + PAD_Y * 2 + 2 : fontSize + PAD_Y * 2;
}

export function layoutLabels(items: { y: number; h: number; fixed?: boolean }[], height: number): number[] {
  const clamp = (y: number, h: number) => Math.min(Math.max(y, h / 2), Math.max(h / 2, height - h / 2));
  const out = items.map((it) => clamp(it.y, it.h));
  const order = items.map((_, i) => i);
  const anchor = items.findIndex((it) => it.fixed);
  const stack = (idx: number[], start: number, dir: 1 | -1) => {
    let edge = start;
    for (const i of idx) {
      const h = items[i].h;
      if (dir > 0) { const top = Math.max(out[i] - h / 2, edge); out[i] = top + h / 2; edge = top + h + GAP; }
      else { const bottom = Math.min(out[i] + h / 2, edge); out[i] = bottom - h / 2; edge = bottom - h - GAP; }
    }
  };
  if (anchor >= 0) {
    const a = out[anchor], ah = items[anchor].h;
    const rest = order.filter((i) => i !== anchor);
    stack(rest.filter((i) => out[i] < a || (out[i] === a && i < anchor)).sort((i, j) => out[j] - out[i]), a - ah / 2 - GAP, -1);
    stack(rest.filter((i) => !(out[i] < a || (out[i] === a && i < anchor))).sort((i, j) => out[i] - out[j]), a + ah / 2 + GAP, 1);
    return out;
  }
  order.sort((i, j) => out[i] - out[j]);
  stack(order, -Infinity, 1);
  stack([...order].reverse(), height, -1);
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

export class ValueLabels implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private request: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private view: IPrimitivePaneView;
  last: { text: string; color: string; filled: boolean; fixed: boolean; y: number; top: number; height: number }[] = [];
  private onRange = () => this.request?.();

  constructor(private src: ValueLabelsSource) {
    const renderer: IPrimitivePaneRenderer = { draw: (t: Target) => this.draw(t) };
    this.view = { zOrder: (): PrimitivePaneViewZOrder => "normal", renderer: () => renderer };
  }

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart; this.request = p.requestUpdate;
    p.chart.timeScale().subscribeVisibleLogicalRangeChange(this.onRange);
    if (this.src.ticking) this.timer = setInterval(() => this.request?.(), 1000);
  }
  detached() {
    try { this.chart?.timeScale().unsubscribeVisibleLogicalRangeChange(this.onRange); } catch {}
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.chart = null; this.request = null;
  }
  updateAllViews() {}
  paneViews() { return []; }
  priceAxisPaneViews() { return [this.view]; }
  update() { this.request?.(); }

  private draw(target: Target) {
    const layout = this.chart?.options().layout;
    if (!layout) return;
    const fs = layout.fontSize, font = `${fs}px ${layout.fontFamily}`;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const labels = this.src.labels().filter((l) => Number.isFinite(l.y) && (l.fixed || (l.y > -fs && l.y < mediaSize.height + fs)));
      const items = labels.map((l) => ({ y: l.y, h: labelHeight(fs, !!l.sub), fixed: l.fixed }));
      const ys = layoutLabels(items, mediaSize.height);
      const bg = this.src.background();
      const right = mediaSize.width - 2;
      ctx.font = font;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      this.last = [];
      const rank = (l: ValueLabel) => (l.fixed ? 2 : l.filled ? 1 : 0);
      const order = labels.map((_, i) => i).sort((i, j) => rank(labels[i]) - rank(labels[j]));
      for (const i of order) {
        const l = labels[i], h = items[i].h, cy = ys[i], top = Math.round(cy - h / 2);
        ctx.strokeStyle = l.color; ctx.lineWidth = 1;
        if (l.filled) {
          ctx.fillStyle = l.color;
          roundRect(ctx, BOX_X, top, right - BOX_X, h, RADIUS); ctx.fill();
          ctx.fillStyle = "#ffffff";
        } else {
          ctx.fillStyle = bg;
          roundRect(ctx, BOX_X + 0.5, top + 0.5, right - BOX_X - 1, h - 1, RADIUS); ctx.fill(); ctx.stroke();
          ctx.fillStyle = l.color;
        }
        const line = fs + 2;
        if (l.sub) {
          ctx.fillText(l.text, TEXT_X, top + PAD_Y + line / 2);
          ctx.globalAlpha = 0.8; ctx.fillText(l.sub, TEXT_X, top + PAD_Y + line * 1.5); ctx.globalAlpha = 1;
        } else ctx.fillText(l.text, TEXT_X, top + h / 2 + 0.5);
        this.last.push({ text: l.text, color: l.color, filled: !!l.filled, fixed: !!l.fixed, y: l.y, top, height: h });
      }
    });
  }
}
