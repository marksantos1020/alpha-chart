import { useEffect, useRef, useState } from "react";
import type { ChartStorage } from "./types";
import type { IndicatorInstance } from "./indicators/types";
import type { ChartSettings } from "./settings";

export interface LayoutDoc {
  schemaVersion: 1;
  interval: string;
  settings: ChartSettings;
  indicators: Omit<IndicatorInstance, "id">[];
  volume: "1" | "0" | "x";
}

const META = "alpha.chart.layout.v1";
const NAME = "default";

function localUpdated(): number { try { return JSON.parse(localStorage.getItem(META) ?? "{}").updated ?? 0; } catch { return 0; } }
function setLocalUpdated(updated: number) { try { localStorage.setItem(META, JSON.stringify({ updated })); } catch {} }

export function useLayout(storage: ChartStorage, current: LayoutDoc, apply: (doc: LayoutDoc) => void) {
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const ready = useRef(false);
  const [kick, setKick] = useState(0);
  const lastJson = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const json = JSON.stringify(current);
  const jsonRef = useRef(json);
  jsonRef.current = json;
  const initialJson = useRef(json);

  useEffect(() => {
    let alive = true;
    storageRef.current.loadLayout(NAME).then((srv) => {
      if (!alive) return;
      const untouched = jsonRef.current === initialJson.current;
      if (untouched && srv.doc && srv.updated > localUpdated() && (srv.doc as { schemaVersion?: number }).schemaVersion === 1) {
        lastJson.current = JSON.stringify(srv.doc);
        setLocalUpdated(srv.updated);
        applyRef.current(srv.doc as unknown as LayoutDoc);
      }
    }).catch(() => undefined).finally(() => {
      if (!alive) return;
      ready.current = true;
      if (!lastJson.current) lastJson.current = initialJson.current;
      if (jsonRef.current !== lastJson.current) setKick((k) => k + 1);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    if (json === lastJson.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      lastJson.current = json;
      const updated = Date.now();
      setLocalUpdated(updated);
      try {
        const r = await storageRef.current.saveLayout(NAME, JSON.parse(json), updated);
        if (!r.ok) {
          lastJson.current = JSON.stringify(r.conflict.doc);
          setLocalUpdated(r.conflict.updated);
          applyRef.current(r.conflict.doc as unknown as LayoutDoc);
        }
      } catch {}
    }, 2000);
  }, [json, kick]);
}
