export interface Anchor { time: number; price: number }

export type DrawingType =
  | "trend" | "ray" | "extended" | "arrow" | "hline" | "hray" | "vline" | "crossline"
  | "channel" | "rect" | "fib" | "fibext" | "brush" | "text";

export type ToolId = "cursor" | "measure" | "zoom" | DrawingType;

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

export const ANCHORS: Record<DrawingType, number> = {
  trend: 2, ray: 2, extended: 2, arrow: 2, hline: 1, hray: 1, vline: 1, crossline: 1,
  channel: 3, rect: 2, fib: 2, fibext: 3, brush: 0, text: 1,
};

export const TOOL_LABEL: Record<ToolId, string> = {
  cursor: "Cross", measure: "Measure", zoom: "Zoom in", trend: "Trend line", ray: "Ray", extended: "Extended line",
  arrow: "Arrow", hline: "Horizontal line", hray: "Horizontal ray", vline: "Vertical line", crossline: "Cross line",
  channel: "Parallel channel", rect: "Rectangle", fib: "Fib retracement", fibext: "Trend-based fib extension",
  brush: "Brush", text: "Text",
};

const FIB_LEVELS: [number, string][] = [
  [0, "#787B86"], [0.236, "#F23645"], [0.382, "#FF9800"], [0.5, "#4CAF50"], [0.618, "#089981"], [0.786, "#00BCD4"],
  [1, "#787B86"], [1.618, "#2962FF"], [2.618, "#F23645"], [3.618, "#9C27B0"], [4.236, "#E91E63"],
];

export function defaultStyle(type: DrawingType): DrawingStyle {
  const base: DrawingStyle = { color: "#2962FF", width: 2, lineStyle: "solid" };
  switch (type) {
    case "hline": case "hray": return { ...base, width: 1, showPrice: true };
    case "vline": case "crossline": return { ...base, width: 1 };
    case "rect": return { ...base, color: "#9C27B0", width: 1, fill: "rgba(156,39,176,0.2)", fillVisible: true };
    case "channel": return { ...base, width: 1, fill: "rgba(41,98,255,0.2)", fillVisible: true };
    case "fib": case "fibext":
      return { ...base, color: "#787B86", width: 1, fill: "rgba(41,98,255,0.06)", fillVisible: true, showLabels: true,
               levels: FIB_LEVELS.map(([value, color]) => ({ value, color, visible: true })) };
    case "brush": return { ...base, width: 2 };
    case "text": return { ...base, text: "Text", fontSize: 14, textColor: "#2962FF" };
    default: return base;
  }
}
