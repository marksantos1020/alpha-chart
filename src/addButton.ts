import { MismatchDirection, type IPrimitivePaneRenderer, type IPrimitivePaneView, type ISeriesApi, type ISeriesPrimitive, type SeriesAttachedParameter, type SeriesType, type Time } from "lightweight-charts";
import type { CanvasColors } from "./theme";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export const ADD_SIZE = 21;
const RADIUS = 4;

export interface AddSpot { y: number; hot: boolean }

export class AddButton implements ISeriesPrimitive<Time> {
  private spot: AddSpot | null = null;
  private refresh: (() => void) | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private view: IPrimitivePaneView;

  constructor(private colors: () => CanvasColors | null) {
    const renderer: IPrimitivePaneRenderer = { draw: (t: Target) => this.draw(t) };
    this.view = { zOrder: () => "top", renderer: () => renderer };
  }

  attached(p: SeriesAttachedParameter<Time>) { this.refresh = p.requestUpdate; this.series = p.series; }
  detached() { this.refresh = null; this.series = null; }
  paneViews() { return [this.view]; }

  set(spot: AddSpot | null) {
    const a = this.spot;
    if (a === spot || (a && spot && a.y === spot.y && a.hot === spot.hot)) return;
    this.spot = spot;
    this.refresh?.();
  }

  private draw(target: Target) {
    const spot = this.spot, c = this.colors();
    if (!spot || !c || !this.series?.dataByIndex(0, MismatchDirection.NearestRight)) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const w = ADD_SIZE - 1, x = mediaSize.width - ADD_SIZE, y = Math.round(spot.y - ADD_SIZE / 2), r = RADIUS;
      ctx.fillStyle = spot.hot ? c.addHover : c.add;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + ADD_SIZE);
      ctx.lineTo(x + r, y + ADD_SIZE);
      ctx.arcTo(x, y + ADD_SIZE, x, y + ADD_SIZE - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      ctx.fill();
      const cx = x + w / 2, cy = y + ADD_SIZE / 2;
      ctx.strokeStyle = c.addText;
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, 6.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 2.9, cy);
      ctx.lineTo(cx + 2.9, cy);
      ctx.moveTo(cx, cy - 2.9);
      ctx.lineTo(cx, cy + 2.9);
      ctx.stroke();
    });
  }
}
