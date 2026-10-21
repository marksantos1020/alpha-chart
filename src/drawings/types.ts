export interface Anchor { time: number; price: number }

export type DrawingType =
  | "trend" | "ray" | "info" | "extended" | "angle" | "hline" | "hray" | "vline" | "crossline"
  | "channel" | "regression" | "flattop" | "pitchfork" | "schiff" | "modschiff"
  | "fib" | "fibext" | "fibchannel" | "fibtime" | "fibfan" | "fibcircles" | "fibarcs" | "gannbox" | "gannfan"
  | "xabcd" | "abcd" | "trianglepat" | "headshoulders" | "threedrives"
  | "elliott" | "elliottabc" | "elliotttri" | "elliottwxy" | "cyclic" | "timecycles" | "sine"
  | "long" | "short" | "avwap" | "fixedvp" | "anchoredvp" | "pricerange" | "daterange" | "datepricerange"
  | "brush" | "highlighter" | "arrowmarker" | "arrow" | "arrowup" | "arrowdown"
  | "rect" | "circle" | "ellipse" | "triangle" | "polyline" | "path" | "curve"
  | "text" | "callout" | "comment" | "pricelabel" | "pricenote" | "flag" | "icon";

export type CursorKind = "cross" | "dot" | "arrow";
export type ToolId = "cursor" | "eraser" | "measure" | "zoom" | DrawingType;

export interface FibLevel { value: number; color: string; visible: boolean }

export interface DrawingStyle {
  color: string;
  width: number;
  lineStyle: "solid" | "dashed" | "dotted";
  fill?: string;
  fillVisible?: boolean;
  extendLeft?: boolean;
  extendRight?: boolean;
  text?: string;
  fontSize?: number;
  textColor?: string;
  levels?: FibLevel[];
  showLabels?: boolean;
  reverse?: boolean;
  showPrice?: boolean;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  anchors: Anchor[];
  style: DrawingStyle;
  locked?: boolean;
  hidden?: boolean;
}

export interface DrawingsDoc { schemaVersion: 1; items: Drawing[] }

export const FREEHAND = 0;
export const OPEN = -1;

export const ANCHORS: Record<DrawingType, number> = {
  trend: 2, ray: 2, info: 2, extended: 2, angle: 2, hline: 1, hray: 1, vline: 1, crossline: 1,
  channel: 3, regression: 2, flattop: 3, pitchfork: 3, schiff: 3, modschiff: 3,
  fib: 2, fibext: 3, fibchannel: 3, fibtime: 2, fibfan: 2, fibcircles: 2, fibarcs: 2, gannbox: 2, gannfan: 2,
  xabcd: 5, abcd: 4, trianglepat: 4, headshoulders: 7, threedrives: 7,
  elliott: 6, elliottabc: 4, elliotttri: 6, elliottwxy: 4, cyclic: 2, timecycles: 2, sine: 2,
  long: 1, short: 1, avwap: 1, fixedvp: 2, anchoredvp: 1, pricerange: 2, daterange: 2, datepricerange: 2,
  brush: FREEHAND, highlighter: FREEHAND, arrowmarker: 2, arrow: 2, arrowup: 1, arrowdown: 1,
  rect: 2, circle: 2, ellipse: 2, triangle: 3, polyline: OPEN, path: OPEN, curve: 3,
  text: 1, callout: 2, comment: 1, pricelabel: 1, pricenote: 2, flag: 1, icon: 1,
};

export const TOOL_LABEL: Record<ToolId, string> = {
  cursor: "Cross", eraser: "Eraser", measure: "Measure", zoom: "Zoom in",
  trend: "Trend line", ray: "Ray", info: "Info line", extended: "Extended line", angle: "Trend angle",
  hline: "Horizontal line", hray: "Horizontal ray", vline: "Vertical line", crossline: "Cross line",
  channel: "Parallel channel", regression: "Regression trend", flattop: "Flat top/bottom",
  pitchfork: "Pitchfork", schiff: "Schiff pitchfork", modschiff: "Modified Schiff pitchfork",
  fib: "Fib retracement", fibext: "Trend-based fib extension", fibchannel: "Fib channel", fibtime: "Fib time zone",
  fibfan: "Fib speed resistance fan", fibcircles: "Fib circles", fibarcs: "Fib speed resistance arcs",
  gannbox: "Gann box", gannfan: "Gann fan",
  xabcd: "XABCD pattern", abcd: "ABCD pattern", trianglepat: "Triangle pattern", headshoulders: "Head and shoulders",
  threedrives: "Three drives pattern", elliott: "Elliott impulse wave (12345)", elliottabc: "Elliott correction wave (ABC)",
  elliotttri: "Elliott triangle wave (ABCDE)", elliottwxy: "Elliott double combo wave (WXY)",
  cyclic: "Cyclic lines", timecycles: "Time cycles", sine: "Sine line",
  long: "Long position", short: "Short position", avwap: "Anchored VWAP", fixedvp: "Fixed range volume profile", anchoredvp: "Anchored volume profile",
  pricerange: "Price range", daterange: "Date range", datepricerange: "Date and price range",
  brush: "Brush", highlighter: "Highlighter", arrowmarker: "Arrow marker", arrow: "Arrow",
  arrowup: "Arrow mark up", arrowdown: "Arrow mark down",
  rect: "Rectangle", circle: "Circle", ellipse: "Ellipse", triangle: "Triangle", polyline: "Polyline", path: "Path", curve: "Curve",
  text: "Text", callout: "Callout", comment: "Comment", pricelabel: "Price label", pricenote: "Price note", flag: "Flag mark", icon: "Icon",
};

export const TEXT_TYPES = new Set<DrawingType>(["text", "callout", "comment", "arrowup", "arrowdown"]);
export const FILL_TYPES = new Set<DrawingType>([
  "rect", "channel", "regression", "flattop", "pitchfork", "schiff", "modschiff", "circle", "ellipse", "triangle",
  "xabcd", "abcd", "trianglepat", "headshoulders", "arrowmarker", "gannbox",
]);
export const LEVEL_TYPES = new Set<DrawingType>(["fib", "fibext", "fibchannel", "fibtime", "fibfan", "fibcircles", "fibarcs", "gannbox"]);
export const EXTEND_TYPES = new Set<DrawingType>(["trend", "info", "angle"]);
export const PRICE_LINE_TYPES = new Set<DrawingType>(["hline", "hray", "crossline"]);
export const ANGLE_SNAP_TYPES = new Set<DrawingType>(["trend", "ray", "info", "extended", "angle", "arrow", "arrowmarker", "pricenote"]);

const FIB_LEVELS: [number, string][] = [
  [0, "#787B86"], [0.236, "#F23645"], [0.382, "#FF9800"], [0.5, "#4CAF50"], [0.618, "#089981"], [0.786, "#00BCD4"],
  [1, "#787B86"], [1.618, "#2962FF"], [2.618, "#F23645"], [3.618, "#9C27B0"], [4.236, "#E91E63"],
];
const FAN_LEVELS: [number, string][] = [[0.25, "#F23645"], [0.382, "#FF9800"], [0.5, "#4CAF50"], [0.618, "#089981"], [0.75, "#00BCD4"], [1, "#787B86"]];
const CIRCLE_LEVELS: [number, string][] = [[0.236, "#F23645"], [0.382, "#FF9800"], [0.5, "#4CAF50"], [0.618, "#089981"], [0.786, "#00BCD4"], [1, "#787B86"], [1.618, "#2962FF"]];
const TIME_LEVELS: [number, string][] = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map((v, i) => [v, i % 2 ? "#2962FF" : "#787B86"]);
const GANN_LEVELS: [number, string][] = [[0, "#787B86"], [0.25, "#FF9800"], [0.382, "#00BCD4"], [0.5, "#4CAF50"], [0.618, "#089981"], [0.75, "#2962FF"], [1, "#787B86"]];

const levels = (l: [number, string][]) => l.map(([value, color]) => ({ value, color, visible: true }));

export function defaultStyle(type: DrawingType): DrawingStyle {
  const base: DrawingStyle = { color: "#2962FF", width: 2, lineStyle: "solid" };
  const fill = (color: string, a = 0.2) => ({ fill: `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${a})`, fillVisible: true });
  const fibLike = (l: [number, string][]) => ({ ...base, color: "#787B86", width: 1, showLabels: true, levels: levels(l) });
  switch (type) {
    case "hline": case "hray": return { ...base, width: 1, showPrice: true };
    case "vline": case "crossline": case "cyclic": case "timecycles": case "sine": return { ...base, width: 1 };
    case "rect": return { ...base, color: "#9C27B0", width: 1, ...fill("#9C27B0") };
    case "circle": case "ellipse": return { ...base, color: "#FF9800", width: 1, ...fill("#FF9800") };
    case "triangle": return { ...base, color: "#089981", width: 1, ...fill("#089981") };
    case "channel": case "regression": case "flattop": return { ...base, width: 1, ...fill("#2962FF") };
    case "pitchfork": case "schiff": case "modschiff": return { ...base, color: "#F23645", width: 1, ...fill("#F23645", 0.08) };
    case "fib": case "fibext": case "fibchannel": return { ...fibLike(FIB_LEVELS), fill: "rgba(41,98,255,0.06)", fillVisible: true };
    case "fibtime": return fibLike(TIME_LEVELS);
    case "fibfan": return { ...fibLike(FAN_LEVELS), fill: "rgba(41,98,255,0.06)", fillVisible: true };
    case "fibcircles": case "fibarcs": return fibLike(CIRCLE_LEVELS);
    case "gannbox": return { ...fibLike(GANN_LEVELS), fill: "rgba(41,98,255,0.06)", fillVisible: true };
    case "gannfan": return { ...base, color: "#FF9800", width: 1, showLabels: true };
    case "xabcd": case "abcd": case "trianglepat": case "headshoulders": return { ...base, width: 1, ...fill("#2962FF") };
    case "threedrives": case "elliott": case "elliottabc": case "elliotttri": case "elliottwxy": return { ...base, width: 1 };
    case "long": case "short": return { ...base, color: "#787B86", width: 1 };
    case "avwap": return { ...base, color: "#E91E63", width: 2 };
    case "fixedvp": case "anchoredvp": return { ...base, color: "#2962FF", width: 1 };
    case "pricerange": case "daterange": case "datepricerange": return { ...base, width: 1 };
    case "brush": return { ...base, width: 2 };
    case "highlighter": return { ...base, color: "#FFEB3B", width: 12 };
    case "arrowmarker": return { ...base, width: 1, ...fill("#2962FF", 1) };
    case "arrowup": return { ...base, color: "#089981", width: 1, text: "", fontSize: 14, textColor: "#089981" };
    case "arrowdown": return { ...base, color: "#F23645", width: 1, text: "", fontSize: 14, textColor: "#F23645" };
    case "polyline": case "path": case "curve": return { ...base, width: 2 };
    case "text": return { ...base, text: "Text", fontSize: 14, textColor: "#2962FF" };
    case "callout": case "comment": return { ...base, text: "Text", fontSize: 14, textColor: "#ffffff" };
    case "pricelabel": case "pricenote": return { ...base, width: 1 };
    case "flag": return { ...base, color: "#F23645", width: 1 };
    case "icon": return { ...base, text: "😀", fontSize: 28 };
    default: return base;
  }
}
