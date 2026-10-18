import type {
  IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, IChartApi, PrimitivePaneViewZOrder,
  SeriesAttachedParameter, SeriesType, Time, UTCTimestamp,
} from "lightweight-charts";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export interface BandData { times: Float64Array; upper: Float64Array; lower: Float64Array; color: string; visible: boolean }

function lowerBound(a: Float64Array, x: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; }
  return lo;
}

export class BandPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private view: IPrimitivePaneView;

  constructor(public data: BandData) {
    const self = this;
    const renderer: IPrimitivePaneRenderer = { draw: (t: Target) => self.draw(t) };
    this.view = { zOrder: (): PrimitivePaneViewZOrder => "bottom", renderer: () => renderer };
  }

  attached(p: SeriesAttachedParameter<Time>) { this.chart = p.chart; this.series = p.series; this.requestUpdate = p.requestUpdate; }
  detached() { this.chart = null; this.series = null; this.requestUpdate = null; }
  updateAllViews() {}
  paneViews() { return [this.view]; }

  set(data: BandData) { this.data = data; this.requestUpdate?.(); }

  private draw(target: Target) {
    const { chart, series, data } = this;
    if (!chart || !series || !data.visible || data.times.length === 0) return;
    const ts = chart.timeScale();
    const range = ts.getVisibleRange();
    if (!range) return;
    const from = Math.max(0, lowerBound(data.times, (range.from as number) * 1000) - 1);
    const to = Math.min(data.times.length - 1, lowerBound(data.times, (range.to as number) * 1000) + 1);
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      ctx.fillStyle = data.color;
      let run: { x: number; yu: number; yl: number }[] = [];
      const flush = () => {
        if (run.length > 1) {
          ctx.beginPath();
          ctx.moveTo(run[0].x * hr, run[0].yu * vr);
          for (let i = 1; i < run.length; i++) ctx.lineTo(run[i].x * hr, run[i].yu * vr);
          for (let i = run.length - 1; i >= 0; i--) ctx.lineTo(run[i].x * hr, run[i].yl * vr);
          ctx.closePath();
          ctx.fill();
        }
        run = [];
      };
      for (let i = from; i <= to; i++) {
        const u = data.upper[i], l = data.lower[i];
        const x = ts.timeToCoordinate(Math.floor(data.times[i] / 1000) as UTCTimestamp);
        if (!Number.isFinite(u) || !Number.isFinite(l) || x === null) { flush(); continue; }
        const yu = series.priceToCoordinate(u), yl = series.priceToCoordinate(l);
        if (yu === null || yl === null) { flush(); continue; }
        run.push({ x, yu, yl });
      }
      flush();
    });
  }
}
