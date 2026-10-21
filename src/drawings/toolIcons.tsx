type P = [number, number];

const R = 1.5;
const n = (v: number) => Math.round(v * 100) / 100;
const ring = ([x, y]: P, r = R) => `M${n(x - r)} ${n(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
function seg(a: P, b: P, cutA: boolean, cutB: boolean) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, g = R + 0.5;
  const sa = cutA ? g / len : 0, sb = cutB ? g / len : 0;
  return `M${n(a[0] + dx * sa)} ${n(a[1] + dy * sa)}L${n(b[0] - dx * sb)} ${n(b[1] - dy * sb)}`;
}
function knots(pts: P[], dots: number[] = pts.map((_, i) => i)) {
  const on = new Set(dots);
  let out = "";
  for (let i = 1; i < pts.length; i++) out += seg(pts[i - 1], pts[i], on.has(i - 1), on.has(i));
  for (const i of dots) out += ring(pts[i]);
  return out;
}
const lines = (...ys: number[]) => ys.map((y) => `M5 ${y}h18`).join("");

interface Spec { d: string; fill?: string; dash?: string }
const ARROW = "M10.5 6.5v14.2l3.4-3.3 2.4 5.3 2.3-1-2.4-5.3h4.6z";
const MAGNET = "M7.5 6.5h4.5v8.5a2 2 0 0 0 4 0V6.5h4.5V15a6.5 6.5 0 0 1-13 0z";
const EYE = "M4.5 14.5c2.6-4.4 5.8-6.5 9.5-6.5s6.9 2.1 9.5 6.5c-2.6 4.4-5.8 6.5-9.5 6.5s-6.9-2.1-9.5-6.5z";
const LOCK_BODY = "M8.5 13.5h11v9h-11z";

export const TOOL_ICONS: Record<string, Spec> = {
  cross: { d: "M14.5 5.5v7M14.5 16.5v7M5.5 14.5h7M16.5 14.5h7" },
  dot: { d: "", fill: ring([14.5, 14.5], 2.5) },
  arrow_cursor: { d: ARROW },
  eraser: { d: "M7.5 18.5l9.3-9.3a1.5 1.5 0 0 1 2.1 0l3 3a1.5 1.5 0 0 1 0 2.1L15 21.5h-4.5zM11.5 14.5l5.5 5.5M10.5 21.5H23" },

  trend: { d: knots([[7.5, 20.5], [20.5, 7.5]]) },
  ray: { d: knots([[6.5, 21.5], [14.5, 13.5], [23, 5]], [0, 1]) },
  info: { d: knots([[5.5, 22.5], [14.5, 13.5]]) + "M16.5 4.5h7v6h-7zM18.5 6.5h3M18.5 8.5h3" },
  extended: { d: knots([[4, 24], [10.5, 17.5], [17.5, 10.5], [24, 4]], [1, 2]) },
  angle: { d: knots([[6.5, 20.5], [21.5, 9.5]], [0]) + seg([6.5, 20.5], [23, 20.5], true, false) + "M14 20.5a7.5 7.5 0 0 0-1.5-4.4" },
  hline: { d: "M4 14.5h8.5M16.5 14.5H24" + ring([14.5, 14.5]) },
  hray: { d: "M10.5 14.5H24" + ring([8.5, 14.5]) },
  vline: { d: "M14.5 4v8.5M14.5 16.5V25" + ring([14.5, 14.5]) },
  crossline: { d: "M4 14.5h8.5M16.5 14.5H24M14.5 4v8.5M14.5 16.5V25" + ring([14.5, 14.5]) },

  channel: { d: knots([[5.5, 17.5], [17.5, 5.5]]) + knots([[10.5, 22.5], [22.5, 10.5]], [0]) },
  regression: { d: "M5 15.5l18-9M5 22.5l18-9", dash: "M5 19l18-9" },
  flattop: { d: knots([[5.5, 21.5], [22.5, 14.5]]) + "M5 7.5h18" },
  pitchfork: { d: knots([[5.5, 19.5], [14.5, 11.5]], [0]) + knots([[12.5, 7.5], [16.5, 15.5]]) + seg([12.5, 7.5], [24, 2.5], true, false) + seg([16.5, 15.5], [24, 12], true, false) + "M14.5 11.5L24 7" },
  schiff: { d: knots([[5.5, 18.5], [12.5, 7.5], [16.5, 16.5]]) + "M9 13L24 7.5M14 8.5L24 4.5M18 16L24 14" },
  modschiff: { d: knots([[4.5, 21.5], [11.5, 9.5], [17.5, 18.5]]) + "M8 15.5L24 9M13 9.5L24 5M19 18L24 16" },

  fib: { d: lines(6.5, 11.5, 16.5, 21.5), dash: "M7 20L22 8" },
  fibext: { d: knots([[5.5, 21.5], [10.5, 9.5], [14.5, 16.5]]) + "M17 5.5h7M17 10.5h7M17 15.5h7M17 20.5h7" },
  fibchannel: { d: "M4 13l11-8M4 18l14-10M6 21l15-11M10 23l14-10" },
  fibtime: { d: "M5.5 5v19M7.5 5v19M10.5 5v19M15.5 5v19M23.5 5v19" },
  fibfan: { d: knots([[5.5, 22.5], [23, 5]], [0]) + seg([5.5, 22.5], [23, 10], true, false) + seg([5.5, 22.5], [23, 15], true, false) + seg([5.5, 22.5], [23, 19.5], true, false) },
  fibcircles: { d: ring([14.5, 14.5], 3.5) + ring([14.5, 14.5], 6.5) + ring([14.5, 14.5], 9.5) },
  fibarcs: { d: "M8.5 21.5a6 6 0 0 1 12 0M5.5 21.5a9 9 0 0 1 18 0M11.5 21.5a3 3 0 0 1 6 0M4 21.5h21" },
  gannbox: { d: "M5.5 5.5h17v17h-17zM5.5 11.5h17M5.5 16.5h17M11.5 5.5v17M16.5 5.5v17" },
  gannfan: { d: ring([5.5, 22.5]) + seg([5.5, 22.5], [23, 5], true, false) + seg([5.5, 22.5], [15, 4.5], true, false) + seg([5.5, 22.5], [23, 13], true, false) + seg([5.5, 22.5], [10, 4.5], true, false) + seg([5.5, 22.5], [23, 18], true, false) },

  xabcd: { d: knots([[4.5, 18.5], [9.5, 7.5], [13.5, 15.5], [18.5, 9.5], [23.5, 20.5]]), dash: "M6 18L12.5 15.5M15 15.5L22 20" },
  abcd: { d: knots([[5.5, 20.5], [11.5, 8.5], [16.5, 15.5], [22.5, 5.5]]) },
  trianglepat: { d: knots([[4.5, 6.5], [9.5, 20.5], [15.5, 9.5], [21.5, 17.5]]), dash: "M6 7.5l18 6.5M11 19.5l13-6" },
  headshoulders: { d: knots([[3.5, 20.5], [7.5, 12.5], [10.5, 17.5], [14.5, 5.5], [18.5, 17.5], [21.5, 12.5], [25, 20.5]], [1, 3, 5]) },
  threedrives: { d: knots([[3.5, 22.5], [7.5, 15.5], [10.5, 18.5], [14.5, 10.5], [17.5, 13.5], [21.5, 5.5], [24.5, 9.5]], [1, 3, 5]) },
  elliott: { d: knots([[4, 21.5], [8.5, 14.5], [11.5, 18.5], [17.5, 6.5], [20.5, 11.5], [24.5, 4.5]], [1, 2, 3, 4, 5]) },
  elliottabc: { d: knots([[5, 6.5], [11.5, 19.5], [16.5, 12.5], [23.5, 22.5]], [1, 2, 3]) },
  elliotttri: { d: knots([[3.5, 4.5], [8.5, 22.5], [12.5, 8.5], [16.5, 19.5], [20.5, 11.5], [24.5, 16.5]], [1, 2, 3, 4, 5]) },
  elliottwxy: { d: knots([[4.5, 21.5], [10.5, 9.5], [16.5, 16.5], [23.5, 4.5]], [1, 2, 3]) },
  cyclic: { d: "M6.5 4v14.5M6.5 22.5V25M12.5 4v14.5M12.5 22.5V25M18.5 4v21M24.5 4v21" + ring([6.5, 20.5]) + ring([12.5, 20.5]) },
  timecycles: { d: "M3.5 19.5a5 5 0 0 1 10 0a5 5 0 0 1 10 0M3 19.5h22" },
  sine: { d: "M3.5 14.5c2.5-7 5-7 7.5 0s5 7 7.5 0 4-6 6-5" },

  long: { d: "M5.5 5.5h17v17h-17zM5.5 15.5h17M9.5 12l2-2.5 2 2.5M11.5 9.5v4" },
  short: { d: "M5.5 5.5h17v17h-17zM5.5 12.5h17M9.5 16l2 2.5 2-2.5M11.5 14.5v4" },
  avwap: { d: ring([5.5, 20.5]) + "M7 19.3c2-.8 3-3.3 5-3.6s3 1.6 5 .6 3-5.5 6.5-8" },
  pricerange: { d: "M6 5.5h16M6 22.5h16M14.5 7.5v13M12 10l2.5-2.5L17 10M12 18l2.5 2.5L17 18" },
  daterange: { d: "M5.5 6v16M22.5 6v16M7.5 14.5h13M10 12l-2.5 2.5L10 17M18 12l2.5 2.5L18 17" },
  datepricerange: { d: "M5.5 5.5h17v17h-17zM14.5 8v13M8 14.5h13M12.5 10l2-2 2 2M19 12.5l2 2-2 2" },

  brush: { d: "M22.5 5.5l-7.6 8.4M14.9 13.9l1.6 1.4M13.6 15.4c-2.4-.9-4.6.3-5.3 2.6-.6 2-1.6 3-3.3 3.6 3.2 1.5 7.6.7 9.1-1.6 1-1.5.9-3.3-.5-4.6z" },
  highlighter: { d: "M9.5 18.5l10-10 3 3-10 10zM9.5 18.5l-3.5 3.5h5l1.5-.5M17.5 10.5l3 3" },
  arrowmarker: { d: "M6.4 20.4l9.1-9.1-2.5-2.5h8.2V17l-2.5-2.5-9.1 9.1z" },
  arrow: { d: "M6.5 21.5l15-15M14.5 6.5h7v7" },
  arrowup: { d: "M14.5 5.5l6 7h-3.5v10h-5v-10H8.5z" },
  arrowdown: { d: "M14.5 23.5l6-7h-3.5v-10h-5v10H8.5z" },
  rect: { d: knots([[6.5, 8.5], [21.5, 8.5], [21.5, 20.5], [6.5, 20.5], [6.5, 8.5]], [0, 2]) },
  circle: { d: ring([14.5, 14.5], 9) + ring([14.5, 14.5]) },
  ellipse: { d: "M4.5 14.5a10 6.5 0 1 0 20 0a10 6.5 0 1 0-20 0" },
  triangle: { d: knots([[14.5, 5.5], [23.5, 21.5], [5.5, 21.5], [14.5, 5.5]], [0, 1, 2]) },
  polyline: { d: knots([[4.5, 18.5], [10.5, 7.5], [16.5, 19.5], [23.5, 9.5]]) },
  path: { d: knots([[4.5, 20.5], [10.5, 9.5], [16.5, 17.5]], [0, 1, 2]) + seg([16.5, 17.5], [23.5, 7.5], true, false) + "M19.5 8l4-.5.5 4" },
  curve: { d: ring([5.5, 20.5]) + ring([22.5, 20.5]) + "M6.6 19.3C10 9 18 9 21.4 19.3" },

  text: { d: "M8.5 7.5h12M14.5 7.5v14M12 21.5h5" },
  callout: { d: "M10.5 5.5h13v9h-7l-9 7.5 4-7.5h-1z" },
  comment: { d: "M5.5 6.5h17a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-10l-5 4v-4h-2a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1zM9.5 11.5h10M9.5 14.5h7" },
  pricelabel: { d: "M5.5 9.5h17v8h-11l-3 4v-4h-3zM9.5 13.5h9" },
  pricenote: { d: ring([5.5, 20.5]) + "M6.8 19.6L13 15M13 11.5h10.5v7H13zM15.5 15h6" },
  flag: { d: "M8.5 23.5v-18M8.5 5.5h13l-3 4.5 3 4.5h-13" },
  icon: { d: ring([14.5, 14.5], 9) + "M10.5 16.5c1 2 2.4 3 4 3s3-1 4-3", fill: ring([11.5, 11.5], 1) + ring([17.5, 11.5], 1) },

  measure: { d: "M4.5 18.5l14-14 5 5-14 14zM9 14l2 2M12 11l2 2M15 8l2 2M7.5 18.5l1.5 1.5M10.5 15.5l1 1M13.5 12.5l1 1" },
  zoom: { d: ring([12.5, 12.5], 7) + "M17.5 17.5l6 6M9.5 12.5h6M12.5 9.5v6" },
  zoomout: { d: ring([12.5, 12.5], 7) + "M17.5 17.5l6 6M9.5 12.5h6" },
  magnet: { d: MAGNET + "M7.5 10.5h4.5M16 10.5h4.5" },
  magnet_strong: { d: MAGNET + "M22.5 3.5l-2 3h2.5l-2 3", fill: "M7.5 6.5h4.5v4h-4.5zM16 6.5h4.5v4H16z" },
  stay: { d: "M6.5 21.5l1-4 9-9 3 3-9 9zM14.5 10.5l3 3M17.5 19.5h6v5h-6zM18.5 19.5v-1.5a1.5 1.5 0 0 1 3 0v1.5" },
  lock: { d: LOCK_BODY + "M10.5 13.5v-3a3.5 3.5 0 0 1 7 0v3M14 17v2" },
  unlock: { d: LOCK_BODY + "M10.5 13.5v-3a3.5 3.5 0 0 1 6.8-1.2M14 17v2" },
  eye: { d: EYE + ring([14, 14.5], 3) },
  eyeoff: { d: EYE + ring([14, 14.5], 3) + "M5.5 23.5l17-17" },
  hide_ind: { d: "M4.5 19.5c3-1 4-8 7.5-8s3.5 5 7 4 3-6 4.5-7M4.5 23.5h19" },
  trash: { d: "M6.5 8.5h15M11.5 8.5v-2h5v2M8.5 8.5l1 14h9l1-14M12.5 11.5v8M15.5 11.5v8" },
  star: { d: "M14.5 5.5l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1-5.4-3-5.4 3 1.1-6.1-4.5-4.2 6.1-.8z" },
  star_on: { d: "", fill: "M14.5 5.5l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1-5.4-3-5.4 3 1.1-6.1-4.5-4.2 6.1-.8z" },
};

export function ToolIcon({ name, size = 28 }: { name: string; size?: number }) {
  const s = TOOL_ICONS[name];
  if (!s) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {s.d && <path d={s.d} />}
      {s.dash && <path d={s.dash} strokeDasharray="2 2" />}
      {s.fill && <path d={s.fill} fill="currentColor" stroke="none" />}
    </svg>
  );
}
