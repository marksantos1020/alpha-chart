import { useEffect, useRef, useState } from "react";
import type { TemplateInfo, TemplateStore } from "../types";
import type { IndicatorInstance } from "./types";

interface Props {
  store: TemplateStore;
  instances: IndicatorInstance[];
  onApply: (list: IndicatorInstance[]) => void;
}

export default function TemplatesMenu({ store, instances, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<TemplateInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const refresh = () => store.list().then((l) => { setList(l); setError(null); }).catch((e) => setError(String(e.message ?? e)));
  useEffect(() => { if (open) refresh(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setSaving(false); } };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      await store.save(n, instances.map(({ id: _id, ...rest }) => rest));
      setSaving(false); setName(""); refresh();
    } catch (e: any) { setError(String(e.message ?? e)); }
  };
  const apply = async (t: TemplateInfo) => {
    try {
      const items = await store.get(t.id);
      onApply(items.map((i) => ({ ...i, id: "" }) as IndicatorInstance));
      setOpen(false);
    } catch (e: any) { setError(String(e.message ?? e)); }
  };
  const rename = async (t: TemplateInfo) => {
    const n = window.prompt("Rename template", t.name)?.trim();
    if (!n || n === t.name) return;
    try { await store.rename(t.id, n); refresh(); } catch (e: any) { setError(String(e.message ?? e)); }
  };
  const remove = async (t: TemplateInfo) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try { await store.remove(t.id); refresh(); } catch (e: any) { setError(String(e.message ?? e)); }
  };

  return (
    <div className="tmpl" ref={ref}>
      <button className={`btn tool ${open ? "on" : ""}`} onClick={() => setOpen(!open)} title="Indicator templates">Templates ▾</button>
      {open && (
        <div className="tmpl-menu" role="menu">
          {saving ? (
            <div className="tmpl-save">
              <input className="search" autoFocus placeholder="Template name" value={name} maxLength={80}
                     onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setSaving(false); }} />
              <button className="btn primary" onClick={save} disabled={!name.trim()}>Save</button>
            </div>
          ) : (
            <button className="tmpl-item" onClick={() => setSaving(true)} disabled={instances.length === 0}
                    title={instances.length === 0 ? "Add indicators first" : "Save the current indicators as a template"}>
              Save indicator template…
            </button>
          )}
          <hr />
          {error && <div className="form-error">{error}</div>}
          {list === null && !error && <div className="muted tmpl-note">Loading…</div>}
          {list?.length === 0 && <div className="muted tmpl-note">No saved templates yet</div>}
          {list?.map((t) => (
            <div key={t.id} className="tmpl-row">
              <button className="tmpl-item" onClick={() => apply(t)} title="Replace the chart's indicators with this template">
                {t.name} <span className="muted">{t.indicators}</span>
              </button>
              <button className="icon-btn" onClick={() => rename(t)} title="Rename">✎</button>
              <button className="icon-btn" onClick={() => remove(t)} title="Delete">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
