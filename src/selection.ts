import {
  MismatchDirection,
  type IChartApi, type IPrimitivePaneRenderer, type IPrimitivePaneView, type ISeriesApi, type ISeriesPrimitive,
  type Logical, type PrimitivePaneViewZOrder, type SeriesAttachedParameter, type SeriesType, type Time,
} from "lightweight-charts";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export const SELECTION_COLOR = "#2962FF";
export const SELECTION_STEP = 10;
export const SELECTION_MIN_PX = 12;

export interface SelectionSource {
  period(): number;
  background(): string;
}

export function selectionStep(barSpacing: number): number {
  let step = SELECTION_STEP;
  if (barSpacing > 0) while (step * barSpacing < SELECTION_MIN_PX) step *= 2;
  return step;
}

export function isSelectionBar(timeSec: number, periodSec: number, step: number): boolean {
  return periodSec > 0 && Math.round(timeSec / periodSec) % step === 0;
}

export class SelectionMarks implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private view: IPrimitivePaneView;
  last: { x: number; y: number; t: number }[] = [];

  constructor(private src: SelectionSource) {
    const renderer: IPrimitivePaneRenderer = { draw: (t: Target) => this.draw(t) };
    this.view = { zOrder: (): PrimitivePaneViewZOrder => "top", renderer: () => renderer };
  }

  attached(p: SeriesAttachedParameter<Time>) { this.chart = p.chart; this.series = p.series; }
  detached() { this.chart = null; this.series = null; }
  updateAllViews() {}
  paneViews() { return [this.view]; }

  points(): { x: number; y: number; t: number }[] {
    const { chart, series } = this;
    if (!chart || !series || !series.options().visible) return [];
    const ts = chart.timeScale(), r = ts.getVisibleLogicalRange();
    const x0 = ts.logicalToCoordinate(0 as Logical), x1 = ts.logicalToCoordinate(1 as Logical);
    if (!r || x0 === null || x1 === null) return [];
    const out: { x: number; y: number; t: number }[] = [];
    const step = selectionStep(x1 - x0), period = this.src.period();
    for (let i = Math.floor(r.from) - 1; i <= Math.ceil(r.to) + 1; i++) {
      const d = series.dataByIndex(i, MismatchDirection.None) as { time?: number; close?: number; value?: number } | null;
      if (!d || typeof d.time !== "number" || !isSelectionBar(d.time, period, step)) continue;
      const v = d.close ?? d.value;
      if (v === undefined || !Number.isFinite(v)) continue;
      const x = ts.logicalToCoordinate(i as Logical), y = series.priceToCoordinate(v);
      if (x !== null && y !== null) out.push({ x, y, t: d.time });
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
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = SELECTION_COLOR; ctx.stroke();
      }
    });
  }
}
