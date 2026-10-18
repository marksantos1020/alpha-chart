import type {
  IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesPrimitive, PrimitivePaneViewZOrder,
  SeriesAttachedParameter, Time, UTCTimestamp,
} from "lightweight-charts";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export interface BgData { times: number[]; color: string; visible: boolean }

export class BgPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private requestUpdate: (() => void) | null = null;
  private view: IPrimitivePaneView;

  constructor(public data: BgData) {
    const renderer: IPrimitivePaneRenderer = { draw: () => undefined, drawBackground: (t: Target) => this.draw(t) };
    this.view = { zOrder: (): PrimitivePaneViewZOrder => "bottom", renderer: () => renderer };
  }

  attached(p: SeriesAttachedParameter<Time>) { this.chart = p.chart; this.requestUpdate = p.requestUpdate; }
  detached() { this.chart = null; this.requestUpdate = null; }
  updateAllViews() {}
  paneViews() { return [this.view]; }
  set(data: BgData) { this.data = data; this.requestUpdate?.(); }

  private draw(target: Target) {
    const { chart, data } = this;
    if (!chart || !data.visible || data.times.length === 0) return;
    const ts = chart.timeScale();
    const range = ts.getVisibleRange();
    if (!range) return;
    const x0 = ts.logicalToCoordinate(0 as never), x1 = ts.logicalToCoordinate(1 as never);
    const spacing = x0 !== null && x1 !== null ? Math.max(1, x1 - x0) : 6;
    const from = (range.from as number) * 1000, to = (range.to as number) * 1000;
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, bitmapSize }) => {
      ctx.fillStyle = data.color;
      for (const t of data.times) {
        if (t < from || t > to) continue;
        const x = ts.timeToCoordinate(Math.floor(t / 1000) as UTCTimestamp);
        if (x === null) continue;
        const left = Math.round((x - spacing / 2) * hr), right = Math.round((x + spacing / 2) * hr);
        ctx.fillRect(left, 0, Math.max(1, right - left), bitmapSize.height);
      }
    });
  }
}
