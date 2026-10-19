import type {
  IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, PrimitivePaneViewZOrder,
  SeriesAttachedParameter, SeriesType, Time, UTCTimestamp,
} from "lightweight-charts";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export interface HlcData { times: number[]; high: number[]; low: number[]; close: number[]; up: string; down: string }

function lowerBound(a: number[], x: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; }
  return lo;
}

function withAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export class HlcArea implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private view: IPrimitivePaneView;

  constructor(public data: HlcData) {
    const renderer: IPrimitivePaneRenderer = { draw: (t: Target) => this.draw(t) };
    this.view = { zOrder: (): PrimitivePaneViewZOrder => "bottom", renderer: () => renderer };
  }

  attached(p: SeriesAttachedParameter<Time>) { this.chart = p.chart; this.series = p.series; this.request = p.requestUpdate; }
  detached() { this.chart = null; this.series = null; this.request = null; }
  updateAllViews() {}
  paneViews() { return [this.view]; }
  set(data: HlcData) { this.data = data; this.request?.(); }

  private draw(target: Target) {
    const { chart, series, data } = this;
    if (!chart || !series || data.times.length === 0) return;
    const ts = chart.timeScale(), range = ts.getVisibleRange();
    if (!range) return;
    const from = Math.max(0, lowerBound(data.times, (range.from as number) * 1000) - 1);
    const to = Math.min(data.times.length - 1, lowerBound(data.times, (range.to as number) * 1000) + 1);
    const pts: { x: number; h: number; l: number; c: number }[] = [];
    for (let i = from; i <= to; i++) {
      const x = ts.timeToCoordinate(Math.floor(data.times[i] / 1000) as UTCTimestamp);
      const h = series.priceToCoordinate(data.high[i]), l = series.priceToCoordinate(data.low[i]), c = series.priceToCoordinate(data.close[i]);
      if (x === null || h === null || l === null || c === null) continue;
      pts.push({ x, h, l, c });
    }
    if (pts.length < 2) return;
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const band = (a: "h" | "c", b: "c" | "l", color: string) => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x * hr, pts[0][a] * vr);
        for (const p of pts) ctx.lineTo(p.x * hr, p[a] * vr);
        for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x * hr, pts[i][b] * vr);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };
      band("h", "c", withAlpha(data.up, 0.2));
      band("c", "l", withAlpha(data.down, 0.2));
      const line = (k: "h" | "l", color: string) => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x * hr, p[k] * vr) : ctx.moveTo(p.x * hr, p[k] * vr)));
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, Math.round(hr));
        ctx.stroke();
      };
      line("h", data.up);
      line("l", data.down);
    });
  }
}
