import type { IndicatorConfig, IndicatorFrame, IndicatorInstance, InputDef, TailFrame } from "./indicators/types";
import type { DrawingsDoc } from "./drawings/types";

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  closed?: boolean;
  final?: boolean;
}

export interface Datafeed {
  getBars(symbol: string, interval: string, req: { limit: number; end?: number }): Promise<Bar[]>;
  subscribeBars?(symbol: string, interval: string, onBars: (bars: Bar[]) => void): () => void;
  historyStart?(symbol: string): number | undefined;
  pricePrecision?(symbol: string): number | undefined | Promise<number | undefined>;
}

export interface ChartPoint { price: number; time: number }

export interface ChartMenuItem { label: string; onSelect: () => void; danger?: boolean }

export type SaveResult<T> = { ok: true } | { ok: false; conflict: { doc: T; updated: number } };
export interface StoredDoc<T> { doc: T | null; updated: number }

export interface TemplateInfo { id: string; name: string; indicators: number }
export type TemplateIndicators = Omit<IndicatorInstance, "id">[];

export interface TemplateStore {
  list(): Promise<TemplateInfo[]>;
  get(id: string): Promise<TemplateIndicators>;
  save(name: string, indicators: TemplateIndicators): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ChartStorage {
  loadLayout(name: string): Promise<StoredDoc<Record<string, unknown>>>;
  saveLayout(name: string, doc: Record<string, unknown>, updated: number): Promise<SaveResult<Record<string, unknown>>>;
  loadDrawings(symbol: string): Promise<StoredDoc<DrawingsDoc>>;
  saveDrawings(symbol: string, doc: DrawingsDoc, updated: number): Promise<SaveResult<DrawingsDoc>>;
  templates?: TemplateStore;
}

export interface StudyEntry {
  id: string;
  name: string;
  shortTitle: string;
  overlay: boolean;
  category: string;
  description: string;
  kind?: "indicator" | "strategy";
}

export type EngineIn =
  | { type: "data"; key: string; bars: Bar[] }
  | { type: "bar"; key: string; bar: Bar }
  | { type: "set"; id: string; study: string; params: Record<string, unknown> }
  | { type: "remove"; id: string };

export type EngineOut =
  | { type: "meta"; id: string; inputs: InputDef[]; config: IndicatorConfig }
  | { type: "error"; id: string; message: string }
  | { type: "frame"; id: string; key: string; full: true; frame: IndicatorFrame }
  | { type: "frame"; id: string; key: string; full: false; frame: TailFrame };

export interface EngineConnection {
  post(msg: EngineIn): void;
  close(): void;
}

export interface IndicatorEngine {
  categories: string[];
  entries(): StudyEntry[];
  entry(id: string): StudyEntry | undefined;
  accepts?(id: string): boolean;
  resolve?(id: string): Promise<StudyEntry>;
  extra?: { category: string; list(): Promise<StudyEntry[]>; empty: string; loading?: string };
  indicatorSources?: boolean;
  connect(onMessage: (msg: EngineOut) => void): EngineConnection;
}

export type OverlayFrame = IndicatorFrame;
