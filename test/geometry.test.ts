import assert from "node:assert/strict";
import {
  channelOffset, distToSegment, extendSegment, fibExtPrice, fibPrice, hitTest, logicalToTime, placeMeasureLabel, pointInPolygon,
  snapAngle, snapTime, timeToLogical, type Pt, type Timeline,
} from "../src/drawings/geometry";
import { defaultStyle, type Drawing } from "../src/drawings/types";
import { isSelectionBar, selectionStep } from "../src/selection";

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`ok  ${name}`); };
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

const H = 3_600_000;
const tl: Timeline = { times: [0, 15, 30, 45, 75, 90].map((m) => m * 60_000), barMs: 15 * 60_000 };

ok("time -> logical on bars, between bars, across a gap, beyond both ends", () => {
  assert.equal(timeToLogical(tl, 0), 0);
  assert.equal(timeToLogical(tl, 45 * 60_000), 3);
  close(timeToLogical(tl, 52.5 * 60_000), 3.25);
  close(timeToLogical(tl, 120 * 60_000), 7);
  close(timeToLogical(tl, -30 * 60_000), -2);
});

ok("logical -> time is the inverse, and snapping lands on bar starts", () => {
  for (const t of [0, 7 * 60_000, 52.5 * 60_000, 90 * 60_000, 150 * 60_000, -45 * 60_000]) close(logicalToTime(tl, timeToLogical(tl, t)), t, 1e-6);
  assert.equal(snapTime(tl, 2.4), 30 * 60_000);
  assert.equal(snapTime(tl, 6.6), 90 * 60_000 + 2 * 15 * 60_000);
});

ok("a drawing made on 15m maps onto 1h bars by time", () => {
  const hourly: Timeline = { times: [0, 1, 2, 3].map((h) => h * H), barMs: H };
  close(timeToLogical(hourly, 45 * 60_000), 0.75);
  close(timeToLogical(hourly, 2.5 * H), 2.5);
});

ok("segment distance and extension to the pane", () => {
  close(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
  close(distToSegment({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
  const [a, b] = extendSegment({ x: 10, y: 10 }, { x: 20, y: 20 }, 100, 50, false, true);
  assert.deepEqual(a, { x: 10, y: 10 });
  close(b.x, 50); close(b.y, 50);
  const [c, d] = extendSegment({ x: 20, y: 10 }, { x: 30, y: 10 }, 100, 50, true, true);
  close(c.x, 0); close(d.x, 100);
  const [e, f] = extendSegment({ x: 40, y: 10 }, { x: 40, y: 30 }, 100, 50, true, true);
  close(e.y, 0); close(f.y, 50); close(e.x, 40);
});

ok("shift snaps to 0/45/90 degrees", () => {
  const a: Pt = { x: 0, y: 0 };
  assert.deepEqual(snapAngle(a, { x: 10, y: 1 }), { x: 10, y: 0 });
  assert.deepEqual(snapAngle(a, { x: 1, y: 10 }), { x: 0, y: 10 });
  const s = snapAngle(a, { x: 10, y: 9 });
  close(s.x, s.y, 1e-9);
});

ok("fib retracement and extension prices (TradingView orientation)", () => {
  const anchors = [{ time: 0, price: 100 }, { time: 1, price: 200 }];
  close(fibPrice(anchors, 0), 200); close(fibPrice(anchors, 1), 100); close(fibPrice(anchors, 0.618), 138.2);
  close(fibPrice(anchors, 0, true), 100);
  const ext = [{ time: 0, price: 100 }, { time: 1, price: 150 }, { time: 2, price: 120 }];
  close(fibExtPrice(ext, 1), 170); close(fibExtPrice(ext, 1.618), 200.9);
});

ok("channel offset and polygons", () => {
  close(channelOffset([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 20 }]), 15);
  assert.ok(pointInPolygon({ x: 5, y: 5 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]));
  assert.ok(!pointInPolygon({ x: 15, y: 5 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]));
});

ok("hit testing: handles of the selection first, then the topmost drawing", () => {
  const toPx = (a: { time: number; price: number }): Pt => ({ x: a.time, y: a.price });
  const line: Drawing = { id: "l", type: "trend", anchors: [{ time: 10, price: 10 }, { time: 90, price: 10 }], style: defaultStyle("trend") };
  const rect: Drawing = { id: "r", type: "rect", anchors: [{ time: 40, price: 0 }, { time: 60, price: 40 }], style: defaultStyle("rect") };
  const hline: Drawing = { id: "h", type: "hline", anchors: [{ time: 0, price: 70 }], style: defaultStyle("hline") };
  const all = [line, rect, hline];
  const tw = () => 40;
  assert.deepEqual(hitTest(all, { x: 50, y: 10 }, toPx, 100, 100, null, tw), { id: "r", handle: null });
  assert.deepEqual(hitTest(all, { x: 20, y: 12 }, toPx, 100, 100, null, tw), { id: "l", handle: null });
  assert.deepEqual(hitTest(all, { x: 11, y: 11 }, toPx, 100, 100, "l", tw), { id: "l", handle: 0 });
  assert.deepEqual(hitTest(all, { x: 5, y: 72 }, toPx, 100, 100, null, tw), { id: "h", handle: null });
  assert.equal(hitTest(all, { x: 5, y: 50 }, toPx, 100, 100, null, tw), null);
  hline.hidden = true;
  assert.equal(hitTest(all, { x: 5, y: 72 }, toPx, 100, 100, null, tw), null);
});

ok("measure label: preferred side, flips at the pane edge, stays inside when neither side fits, clamps horizontally", () => {
  const pane = { w: 800, h: 400 }, size = { w: 160, h: 56 };
  let r = placeMeasureLabel({ x: 300, y: 300 }, { x: 400, y: 200 }, size, pane, true);
  assert.equal(r.side, "above"); close(r.y, 200 - 6 - 56); close(r.x, 350 - 80);
  r = placeMeasureLabel({ x: 300, y: 300 }, { x: 400, y: 20 }, size, pane, true);
  assert.equal(r.side, "below"); close(r.y, 306);
  r = placeMeasureLabel({ x: 300, y: 100 }, { x: 400, y: 380 }, size, pane, false);
  assert.equal(r.side, "above"); close(r.y, 100 - 6 - 56);
  r = placeMeasureLabel({ x: 300, y: 100 }, { x: 400, y: 200 }, size, pane, false);
  assert.equal(r.side, "below"); close(r.y, 206);
  r = placeMeasureLabel({ x: 300, y: 395 }, { x: 400, y: -50 }, size, pane, true);
  assert.equal(r.side, "inside"); close(r.y, 4);
  r = placeMeasureLabel({ x: 300, y: -40 }, { x: 400, y: 420 }, size, pane, false);
  assert.equal(r.side, "inside"); close(r.y, 400 - 56 - 4);
  r = placeMeasureLabel({ x: 5, y: 300 }, { x: 40, y: 250 }, size, pane, true);
  close(r.x, 4);
  r = placeMeasureLabel({ x: 760, y: 300 }, { x: 799, y: 250 }, size, pane, true);
  close(r.x, 800 - 160 - 4);
  assert.ok(r.y >= 4 && r.y + r.h <= 396);
});

ok("selection circles: every 12th bar by bar time, thinned by doubling only when closer than 14 px", () => {
  assert.equal(selectionStep(12.5), 12);
  assert.equal(selectionStep(1.25), 12);
  assert.equal(selectionStep(0.6), 24);
  assert.equal(selectionStep(0.2), 96);
  const hour = 3600, marked = (step: number) => Array.from({ length: 200 }, (_, i) => 1_700_000_000 - 1_700_000_000 % hour + i * hour).filter((t) => isSelectionBar(t, hour, step));
  assert.ok(marked(12).length === 16 || marked(12).length === 17);
  for (let i = 1; i < marked(12).length; i++) assert.equal(marked(12)[i] - marked(12)[i - 1], 12 * hour);
  assert.ok(marked(24).every((t) => marked(12).includes(t)));
});

console.log(`GEOMETRY OK (${n})`);
