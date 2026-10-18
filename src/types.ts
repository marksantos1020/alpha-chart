// The contracts between alpha-chart and the application that hosts it. The chart never fetches
// anything itself: market data comes from a Datafeed, saved state goes to a ChartStorage and
// indicators are computed by an IndicatorEngine. All three are supplied by the host.

import type { IndicatorConfig, IndicatorFrame, IndicatorInstance, InputDef, TailFrame } from "./indicators/types";
import type { DrawingsDoc } from "./drawings/types";

/** One bar. `time` is the bar's open time in epoch milliseconds (UTC). Hosts may add fields; the
 *  chart passes bar objects through to the IndicatorEngine unchanged. */
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  /** The bar is complete (a later bar has started). Undefined counts as closed except for the last bar. */
  closed?: boolean;
  /** The bar can no longer change (e.g. its data is finalized). */
  final?: boolean;
}

/** Market data. Intervals use TradingView resolution names: "1" "5" "15" "30" "60" "120" "240" "D" "W". */
export interface Datafeed {
  /** Up to `limit` bars, oldest first, ending at the newest bar (or the newest with time <= `end`). */
  getBars(symbol: string, interval: string, req: { limit: number; end?: number }): Promise<Bar[]>;
  /** Live updates: called with new or changed bars (the forming bar repeatedly). Returns unsubscribe. */
  subscribeBars?(symbol: string, interval: string, onBars: (bars: Bar[]) => void): () => void;
  /** Time of the first bar there is (for the "All" range); undefined = unknown, page until the start. */
  historyStart?(symbol: string): number | undefined;
}

export type SaveResult<T> = { ok: true } | { ok: false; conflict: { doc: T; updated: number } };
export interface StoredDoc<T> { doc: T | null; updated: number }

export interface TemplateInfo { id: string; name: string; indicators: number }
export type TemplateIndicators = Omit<IndicatorInstance, "id">[];

/** Indicator templates (optional: the Templates menu is hidden without it). */
export interface TemplateStore {
  list(): Promise<TemplateInfo[]>;
  get(id: string): Promise<TemplateIndicators>;
  save(name: string, indicators: TemplateIndicators): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Where the chart keeps the user's layout and drawings. Writes carry `updated` (ms); a store that
 *  holds a newer version answers with a conflict, and the chart adopts that version. */
export interface ChartStorage {
  loadLayout(name: string): Promise<StoredDoc<Record<string, unknown>>>;
  saveLayout(name: string, doc: Record<string, unknown>, updated: number): Promise<SaveResult<Record<string, unknown>>>;
  loadDrawings(symbol: string): Promise<StoredDoc<DrawingsDoc>>;
  saveDrawings(symbol: string, doc: DrawingsDoc, updated: number): Promise<SaveResult<DrawingsDoc>>;
  templates?: TemplateStore;
}

/** A study the indicator picker lists. */
export interface StudyEntry {
  id: string;
  name: string;
  shortTitle: string;
  /** Draws on the price pane by default (otherwise in its own pane). */
  overlay: boolean;
  category: string;
  description: string;
  /** "strategy" entries are not added as indicators: the picker hands them to `onAddStrategy`. */
  kind?: "indicator" | "strategy";
}

/** Messages the chart sends to the engine. `key` = "<symbol>:<interval>" of the bars. */
export type EngineIn =
  | { type: "data"; key: string; bars: Bar[] }
  | { type: "bar"; key: string; bar: Bar }
  | { type: "set"; id: string; study: string; params: Record<string, unknown> }
  | { type: "remove"; id: string };

/** Messages the engine sends back. A full frame replaces the instance's output; a tail frame
 *  rewrites its last values (live updates). */
export type EngineOut =
  | { type: "meta"; id: string; inputs: InputDef[]; config: IndicatorConfig }
  | { type: "error"; id: string; message: string }
  | { type: "frame"; id: string; key: string; full: true; frame: IndicatorFrame }
  | { type: "frame"; id: string; key: string; full: false; frame: TailFrame };

export interface EngineConnection {
  post(msg: EngineIn): void;
  close(): void;
}

/** Computes indicators. Usually wraps a Web Worker; `connect` is called once per mounted chart. */
export interface IndicatorEngine {
  /** Picker categories, in order. */
  categories: string[];
  /** Studies known synchronously (built-ins). */
  entries(): StudyEntry[];
  /** Lookup by id, including ids resolved later through `resolve`. */
  entry(id: string): StudyEntry | undefined;
  /** Keep this id in saved layouts even if `entry` does not know it yet (it can be resolved). */
  accepts?(id: string): boolean;
  /** Load a study `entry` does not know yet (e.g. a user's saved script). Rejects when it is gone. */
  resolve?(id: string): Promise<StudyEntry>;
  /** More studies listed in the picker, loaded when it opens (e.g. the user's own scripts). */
  extra?: { category: string; list(): Promise<StudyEntry[]>; empty: string; loading?: string };
  connect(onMessage: (msg: EngineOut) => void): EngineConnection;
}

/** Plots, shapes and fills the host draws on top of the chart (e.g. a strategy's output). Panes:
 *  plot `pane` 0 = price pane, 1.. = panes below the indicators. */
export type OverlayFrame = IndicatorFrame;
