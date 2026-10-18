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
}

export interface PlotFrame {
  title: string; pane: number; style: string; color: string; width: number; lineStyle: string;
  colorUp?: string; colorDown?: string; colorBy?: string; baseValue?: number; display: string;
  times: Float64Array; values: Float64Array;
}
export interface BandFrame { title: string; color: string; times: Float64Array; upper: Float64Array; lower: Float64Array }
export interface HLine { value: number; title?: string; color?: string; style?: string; width?: number; pane?: number }

export interface IndicatorFrame {
  plots: PlotFrame[];
  bands: BandFrame[];
  hlines: HLine[];
  shapes: { time: number; shape: string; location: string; color: string; text?: string }[];
  bgcolors: { color: string; times: number[] }[];
}

export interface TailFrame {
  n: number;
  times: number[];
  plots: number[][];
  bands: { upper: number[]; lower: number[] }[];
  shapes: IndicatorFrame["shapes"];
  bgcolors: IndicatorFrame["bgcolors"];
}

export interface IndicatorState {
  inputs: InputDef[];
  config: IndicatorConfig;
  error: string | null;
}
