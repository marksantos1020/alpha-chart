import type { CursorKind, DrawingType, ToolId } from "./types";

export interface ToolSection { title: string; tools: DrawingType[] }
export interface ToolGroup { key: string; label: string; sections: ToolSection[] }

export const GROUPS: ToolGroup[] = [
  { key: "lines", label: "Trend line tools", sections: [
    { title: "Lines", tools: ["trend", "ray", "info", "extended", "angle", "hline", "hray", "vline", "crossline"] },
    { title: "Channels", tools: ["channel", "regression", "flattop"] },
    { title: "Pitchforks", tools: ["pitchfork", "schiff", "modschiff"] },
  ] },
  { key: "fib", label: "Gann and Fibonacci tools", sections: [
    { title: "Fibonacci", tools: ["fib", "fibext", "fibchannel", "fibtime", "fibfan", "fibcircles", "fibarcs"] },
    { title: "Gann", tools: ["gannbox", "gannfan"] },
  ] },
  { key: "patterns", label: "Patterns", sections: [
    { title: "Chart patterns", tools: ["xabcd", "abcd", "trianglepat", "headshoulders", "threedrives"] },
    { title: "Elliott waves", tools: ["elliott", "elliottabc", "elliotttri", "elliottwxy"] },
    { title: "Cycles", tools: ["cyclic", "timecycles", "sine"] },
  ] },
  { key: "forecast", label: "Forecasting and measurement tools", sections: [
    { title: "Forecasting", tools: ["long", "short"] },
    { title: "Volume-based", tools: ["avwap"] },
    { title: "Measurer", tools: ["pricerange", "daterange", "datepricerange"] },
  ] },
  { key: "shapes", label: "Geometric shapes", sections: [
    { title: "Brushes", tools: ["brush", "highlighter"] },
    { title: "Arrows", tools: ["arrowmarker", "arrow", "arrowup", "arrowdown"] },
    { title: "Shapes", tools: ["rect", "circle", "ellipse", "triangle", "polyline", "path", "curve"] },
  ] },
  { key: "annot", label: "Annotation tools", sections: [
    { title: "Text and notes", tools: ["text", "callout", "comment", "pricelabel", "pricenote", "flag"] },
  ] },
];

export const CURSORS: { kind: CursorKind; label: string; icon: string }[] = [
  { kind: "cross", label: "Cross", icon: "cross" },
  { kind: "dot", label: "Dot", icon: "dot" },
  { kind: "arrow", label: "Arrow", icon: "arrow_cursor" },
];

export const HINT: Partial<Record<ToolId, string>> = {
  trend: "Alt + T", hline: "Alt + H", hray: "Alt + J", vline: "Alt + V", crossline: "Alt + C", fib: "Alt + F", rect: "Alt + R",
  measure: "Shift + Click",
};
export const SHORTCUTS: Record<string, ToolId> = { t: "trend", h: "hline", j: "hray", v: "vline", f: "fib", c: "crossline", r: "rect" };

export const ICONS = [
  "😀", "😂", "😍", "😎", "🤔", "😱", "😭", "😡", "👍", "👎", "👏", "🙏", "💪", "👀", "🔥", "⭐",
  "✨", "💥", "⚡", "❄️", "☀️", "🌙", "🌈", "🚀", "🎯", "🏁", "🚩", "📈", "📉", "💰", "💎", "🏦",
  "⚠️", "❗", "❓", "✅", "❌", "⛔", "🔔", "🔒", "🔑", "💡", "📌", "📍", "⏰", "🐂", "🐻", "🐋",
];
