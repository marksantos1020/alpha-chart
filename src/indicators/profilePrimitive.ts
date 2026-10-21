import type {
  IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, PrimitivePaneViewZOrder,
  SeriesAttachedParameter, SeriesType, Time,
} from "lightweight-charts";
import { computeProfile, paintProfile, sessionRanges, type ProfileBars } from "../volumeProfile";
import type { ProfileSpec } from "./types";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export interface ProfileData { specs: ProfileSpec[]; visible: boolean }

const DAY = 86_400_000, WEEK = 7 * DAY;

export class ProfilePrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private view: IPrimitivePaneView;

  constructor(public data: ProfileData, private bars: () => ProfileBars, private timeToX: (t: number) => number | null) {
    const renderer: IPrimitivePaneRenderer = { draw: () => undefined, drawBackground: (t: Target) => this.draw(t) };
    this.view = { zOrder: (): PrimitivePaneViewZOrder => "normal", renderer: () => renderer };
  }

  attached(p: SeriesAttachedParameter<Time>) { this.chart = p.chart; this.series = p.series; this.requestUpdate = p.requestUpdate; }
  detached() { this.chart = null; this.series = null; this.requestUpdate = null; }
  updateAllViews() {}
  paneViews() { return [this.view]; }
  set(data: ProfileData) { this.data = data; this.requestUpdate?.(); }

  private draw(target: Target) {
    const { chart, series, data } = this;
    if (!chart || !series || !data.visible || !data.specs.length) return;
    const b = this.bars(), n = b.times.length;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!n || !range) return;
    const from = Math.max(0, Math.ceil(range.from)), to = Math.min(n - 1, Math.floor(range.to));
    if (to < from) return;
    const yOf = (p: number) => series.priceToCoordinate(p);
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const w = mediaSize.width;
      for (const s of data.specs) {
        const colors = { up: s.upColor, down: s.downColor, vaUp: s.vaUpColor, vaDown: s.vaDownColor, poc: s.pocColor };
        if (s.range === "visible") {
          const p = computeProfile(b, from, to, s.rows, s.valueArea);
          if (!p) continue;
          const width = (w * s.widthPercent) / 100, right = s.placement === "right";
          paintProfile(ctx, p, yOf, right ? w : 0, width, right ? -1 : 1, colors, { show: s.showPoc, x0: 0, x1: w });
          continue;
        }
        const weekly = s.session === "week";
        let start = from;
        const key = (t: number) => Math.floor((t - (weekly ? 4 * DAY : 0)) / (weekly ? WEEK : DAY));
        while (start > 0 && key(b.times[start - 1]) === key(b.times[from])) start--;
        for (const [i0, i1] of sessionRanges(b.times, start, to, weekly ? WEEK : DAY, weekly ? 4 * DAY : 0)) {
          const p = computeProfile(b, i0, i1, s.rows, s.valueArea);
          const xa = this.timeToX(b.times[i0]), xb = this.timeToX(b.times[i1]);
          if (!p || xa === null || xb === null) continue;
          const span = Math.max(4, xb - xa), width = (span * s.widthPercent) / 100, right = s.placement === "right";
          paintProfile(ctx, p, yOf, right ? xb : xa, width, right ? -1 : 1, colors, { show: s.showPoc, x0: xa, x1: xb });
        }
      }
    });
  }
}
