import {
  MismatchDirection,
  type IChartApi, type IPrimitivePaneRenderer, type IPrimitivePaneView, type ISeriesApi, type ISeriesPrimitive,
  type Logical, type PrimitivePaneViewZOrder, type SeriesAttachedParameter, type SeriesType, type Time,
} from "lightweight-charts";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export const SELECTION_COLOR = "#2962FF";
export const SELECTION_SPACING = 130;

export interface SelectionSource {
  anchor(): number | null;
  background(): string;
}

export function selectionStep(barSpacing: number): number {
  return barSpacing > 0 ? Math.max(1, Math.round(SELECTION_SPACING / barSpacing)) : 1;
}

export function selectionIndices(last: number, from: number, to: number, step: number): number[] {
  const out: number[] = [];
  let i = last > to ? last - Math.ceil((last - to) / step) * step : last;
  for (; i >= from; i -= step) out.push(i);
  return out;
}

export class SelectionMarks implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private view: IPrimitivePaneView;
  last: { x: number; y: number }[] = [];

  constructor(private src: SelectionSource) {
    const renderer: IPrimitivePaneRenderer = { draw: (t: Target) => this.draw(t) };
    this.view = { zOrder: (): PrimitivePaneViewZOrder => "top", renderer: () => renderer };
  }

  attached(p: SeriesAttachedParameter<Time>) { this.chart = p.chart; this.series = p.series; }
  detached() { this.chart = null; this.series = null; }
  updateAllViews() {}
  paneViews() { return [this.view]; }

  points(): { x: number; y: number }[] {
    const { chart, series } = this;
    const last = this.src.anchor();
    if (!chart || !series || last === null || !series.options().visible) return [];
    const ts = chart.timeScale(), r = ts.getVisibleLogicalRange();
    const x0 = ts.logicalToCoordinate(0 as Logical), x1 = ts.logicalToCoordinate(1 as Logical);
    if (!r || x0 === null || x1 === null) return [];
    const out: { x: number; y: number }[] = [];
    for (const i of selectionIndices(last, Math.floor(r.from) - 1, Math.ceil(r.to) + 1, selectionStep(x1 - x0))) {
      const d = series.dataByIndex(i, MismatchDirection.None) as { close?: number; value?: number } | null;
      const v = d?.close ?? d?.value;
      if (v === undefined || !Number.isFinite(v)) continue;
      const x = ts.logicalToCoordinate(i as Logical), y = series.priceToCoordinate(v);
      if (x !== null && y !== null) out.push({ x, y });
    }
    return out;
  }

  private draw(target: Target) {
    const pts = this.points();
    this.last = pts;
    if (!pts.length) return;
    const bg = this.src.background();
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const { x, y } of pts) {
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = SELECTION_COLOR; ctx.stroke();
      }
    });
  }
}
