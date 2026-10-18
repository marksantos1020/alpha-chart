import type { ChartStorage, SaveResult, StoredDoc, TemplateIndicators, TemplateInfo } from "./types";
import type { DrawingsDoc } from "./drawings/types";
import { uid } from "./uid";

function read<T>(key: string): StoredDoc<T> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    if (raw && typeof raw.updated === "number") return { doc: raw.doc ?? null, updated: raw.updated };
  } catch {}
  return { doc: null, updated: 0 };
}

function write<T>(key: string, doc: T, updated: number): SaveResult<T> {
  const cur = read<T>(key);
  if (cur.doc && cur.updated > updated) return { ok: false, conflict: { doc: cur.doc, updated: cur.updated } };
  try { localStorage.setItem(key, JSON.stringify({ doc, updated })); } catch {}
  return { ok: true };
}

interface StoredTemplate { id: string; name: string; indicators: TemplateIndicators }

/** A ChartStorage in the browser's localStorage: layouts, drawings and indicator templates stay on
 *  this device. `prefix` namespaces the keys (several charts or apps on one origin). */
export function localChartStorage(prefix = "alpha-chart"): ChartStorage {
  const tKey = `${prefix}.templates`;
  const templates = (): StoredTemplate[] => {
    try { const v = JSON.parse(localStorage.getItem(tKey) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  const saveTemplates = (list: StoredTemplate[]) => { try { localStorage.setItem(tKey, JSON.stringify(list)); } catch {} };
  return {
    loadLayout: async (name) => read<Record<string, unknown>>(`${prefix}.layout.${name}`),
    saveLayout: async (name, doc, updated) => write(`${prefix}.layout.${name}`, doc, updated),
    loadDrawings: async (symbol) => read<DrawingsDoc>(`${prefix}.drawings.${symbol}`),
    saveDrawings: async (symbol, doc, updated) => write(`${prefix}.drawings.${symbol}`, doc, updated),
    templates: {
      list: async (): Promise<TemplateInfo[]> =>
        templates().map((t) => ({ id: t.id, name: t.name, indicators: t.indicators.length })).sort((a, b) => a.name.localeCompare(b.name)),
      get: async (id) => {
        const t = templates().find((x) => x.id === id);
        if (!t) throw new Error("template not found");
        return t.indicators;
      },
      save: async (name, indicators) => {
        const list = templates(), same = list.find((t) => t.name === name);
        if (same) same.indicators = indicators; else list.push({ id: uid(), name, indicators });
        saveTemplates(list);
      },
      rename: async (id, name) => saveTemplates(templates().map((t) => (t.id === id ? { ...t, name } : t))),
      remove: async (id) => saveTemplates(templates().filter((t) => t.id !== id)),
    },
  };
}
