import type {
  IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, PrimitivePaneViewZOrder,
  SeriesAttachedParameter, SeriesType, Time,
} from "lightweight-charts";
import type { DrawFrame } from "./types";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];
type Ctx = CanvasRenderingContext2D;

export interface DrawData { frame: DrawFrame | undefined; visible: boolean }

const FONT = '"IBM Plex Sans", system-ui, sans-serif';
const SIZE: Record<string, number> = { tiny: 9, small: 11, normal: 12, large: 15 };
const DASH: Record<string, number[]> = { solid: [], dashed: [6, 4], dotted: [1.5, 3] };

export class DrawPrimitive implements ISeriesPrimitive<Time> {
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private view: IPrimitivePaneView;

  constructor(public data: DrawData, private timeToX: (t: number) => number | null) {
    const renderer: IPrimitivePaneRenderer = { draw: (t: Target) => this.draw(t) };
    this.view = { zOrder: (): PrimitivePaneViewZOrder => "top", renderer: () => renderer };
  }

  attached(p: SeriesAttachedParameter<Time>) { this.series = p.series; this.requestUpdate = p.requestUpdate; }
  detached() { this.series = null; this.requestUpdate = null; }
  updateAllViews() {}
  paneViews() { return [this.view]; }
  set(data: DrawData) { this.data = data; this.requestUpdate?.(); }

  private draw(target: Target) {
    const { series, data } = this;
    const f = data.frame;
    if (!series || !data.visible || !f || (!f.lines.length && !f.labels.length && !f.boxes.length)) return;
    const y = (p: number) => series.priceToCoordinate(p);
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const w = mediaSize.width, h = mediaSize.height;
      ctx.save();
      for (const b of f.boxes) {
        const x1 = this.timeToX(b.left), x2 = this.timeToX(b.right), y1 = y(b.top), y2 = y(b.bottom);
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
        const l = Math.min(x1, x2), t = Math.min(y1, y2), bw = Math.abs(x2 - x1), bh = Math.abs(y2 - y1);
        if (l > w || l + bw < 0) continue;
        ctx.fillStyle = b.bgColor; ctx.fillRect(l, t, bw, bh);
        ctx.strokeStyle = b.color; ctx.lineWidth = b.width; ctx.setLineDash(DASH[b.style] ?? []);
        ctx.strokeRect(l, t, bw, bh);
        if (b.text) {
          ctx.font = `12px ${FONT}`; ctx.fillStyle = b.textColor; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(b.text, l + bw / 2, t + bh / 2);
        }
      }
      for (const ln of f.lines) {
        const x1 = this.timeToX(ln.x1), x2 = this.timeToX(ln.x2), y1 = y(ln.y1), y2 = y(ln.y2);
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
        type P = { x: number; y: number };
        let a: P = { x: x1, y: y1 }, b: P = { x: x2, y: y2 };
        if (ln.extend !== "none" && (x1 !== x2 || y1 !== y2)) {
          const dx = x2 - x1, dy = y2 - y1;
          const far = (from: P, dir: 1 | -1): P => {
            if (dx === 0) return { x: from.x, y: dir * dy > 0 ? h : 0 };
            const tx = ((dir * dx > 0 ? w : 0) - from.x) / dx;
            return { x: from.x + tx * dx, y: from.y + tx * dy };
          };
          const fwd = x2 >= x1;
          if (ln.extend === "right" || ln.extend === "both") { if (fwd) b = far(b, 1); else a = far(a, -1); }
          if (ln.extend === "left" || ln.extend === "both") { if (fwd) a = far(a, -1); else b = far(b, 1); }
        }
        if (Math.max(a.x, b.x) < 0 || Math.min(a.x, b.x) > w) continue;
        ctx.strokeStyle = ln.color; ctx.lineWidth = ln.width; ctx.setLineDash(DASH[ln.style] ?? []);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const lb of f.labels) {
        const x = this.timeToX(lb.x), yy = y(lb.y);
        if (x === null || yy === null || x < -200 || x > w + 200) continue;
        this.label(ctx, lb.text, x, yy, lb.color, lb.textColor, lb.style, SIZE[lb.size] ?? 12);
      }
      ctx.restore();
    });
  }

  private label(ctx: Ctx, text: string, x: number, y: number, bg: string, fg: string, style: string, size: number) {
    ctx.font = `${size}px ${FONT}`;
    const lines = text ? text.split("\n") : [];
    const tw = lines.length ? Math.max(...lines.map((l) => ctx.measureText(l).width)) : 0;
    const pad = 5, lh = Math.round(size * 1.3), bw = Math.max(tw + pad * 2, 10), bh = Math.max(lines.length * lh + pad, 10), tip = 6;
    let bx = x - bw / 2, by = y - bh / 2;
    if (style === "down") by = y - tip - bh;
    else if (style === "up") by = y + tip;
    else if (style === "left") bx = x + tip;
    else if (style === "right") bx = x - tip - bw;
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 3); else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    if (style !== "none") {
      ctx.beginPath();
      if (style === "down") { ctx.moveTo(x - tip, by + bh); ctx.lineTo(x, y); ctx.lineTo(x + tip, by + bh); }
      else if (style === "up") { ctx.moveTo(x - tip, by); ctx.lineTo(x, y); ctx.lineTo(x + tip, by); }
      else if (style === "left") { ctx.moveTo(bx, y - tip); ctx.lineTo(x, y); ctx.lineTo(bx, y + tip); }
      else { ctx.moveTo(bx + bw, y - tip); ctx.lineTo(x, y); ctx.lineTo(bx + bw, y + tip); }
      ctx.fill();
    }
    ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "top";
    lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + pad / 2 + 1 + i * lh));
  }
}
