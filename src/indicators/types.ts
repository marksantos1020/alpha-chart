export interface InputDef {
  name: string;
  type: "int" | "float" | "bool" | "select" | "string" | "source" | "color";
  default: unknown;
  min?: number; max?: number; step?: number; options?: string[]; group?: string; tooltip?: string; inline?: string;
}

export interface IndicatorConfig {
  name?: string; shortTitle?: string; overlay?: boolean; precision?: number;
  format?: "price" | "percent" | "volume"; titleInputs?: string[];
}

export interface PlotStyle { visible?: boolean; color?: string; colorUp?: string; colorDown?: string; width?: number; lineStyle?: "solid" | "dashed" | "dotted" }

export interface IndicatorInstance {
  id: string;
  libraryId: string;
  inputs: Record<string, unknown>;
  style: Record<string, PlotStyle>;
  visible: boolean;
  overlay: boolean | null;
  intervals?: string[];
  paneHeight?: number;
  mergeWith?: string;
  scale?: "right" | "left" | "none";
  scaleLabels?: boolean;
}

export interface PlotFrame {
  title: string; pane: number; style: string; color: string; width: number; lineStyle: string;
  colorUp?: string; colorDown?: string; colorBy?: string; baseValue?: number; display: string;
  times: Float64Array; values: Float64Array;
  offset?: number; palette?: string[]; colors?: Float64Array;
  open?: Float64Array; high?: Float64Array; low?: Float64Array; wickColor?: string;
}

export interface DrawLine { id: number; x1: number; y1: number; x2: number; y2: number; color: string; width: number; style: string; extend: string }
export interface DrawLabel { id: number; x: number; y: number; text: string; color: string; textColor: string; style: string; size: string }
export interface DrawBox { id: number; left: number; top: number; right: number; bottom: number; color: string; bgColor: string; width: number; style: string; text: string; textColor: string }
export interface DrawFrame { lines: DrawLine[]; labels: DrawLabel[]; boxes: DrawBox[] }

export interface ProfileSpec {
  title: string; range: "visible" | "session"; session?: "day" | "week";
  rows: number; valueArea: number; widthPercent: number; placement: "right" | "left";
  upColor: string; downColor: string; vaUpColor: string; vaDownColor: string; pocColor: string; showPoc: boolean;
}
export interface BandFrame { title: string; color: string; times: Float64Array; upper: Float64Array; lower: Float64Array; offset?: number; colorDown?: string }
export interface HLine { value: number; title?: string; color?: string; style?: string; width?: number; pane?: number }

export interface IndicatorFrame {
  plots: PlotFrame[];
  bands: BandFrame[];
  hlines: HLine[];
  shapes: { time: number; shape: string; location: string; color: string; text?: string }[];
  bgcolors: { color: string; times: number[] }[];
  barcolors?: { color: string; times: number[] }[];
  drawings?: DrawFrame;
  profiles?: ProfileSpec[];
}

export interface TailFrame {
  n: number;
  times: number[];
  plots: number[][];
  bands: { upper: number[]; lower: number[] }[];
  shapes: IndicatorFrame["shapes"];
  bgcolors: IndicatorFrame["bgcolors"];
  extras?: ({ colors?: number[]; open?: number[]; high?: number[]; low?: number[] } | null)[];
  barcolors?: IndicatorFrame["barcolors"];
  drawings?: DrawFrame;
}

export interface IndicatorState {
  inputs: InputDef[];
  config: IndicatorConfig;
  error: string | null;
}
