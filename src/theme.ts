import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type ThemeMode = "dark" | "light" | "system";
export type Theme = "dark" | "light";

export const THEME_MODES: [ThemeMode, string][] = [["dark", "Dark"], ["light", "Light"], ["system", "System"]];
export const THEME_KEY = "alpha.theme";

const media = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null);

export function systemTheme(): Theme { return media()?.matches ? "light" : "dark"; }
export function resolveTheme(mode: ThemeMode): Theme { return mode === "system" ? systemTheme() : mode; }
export const isThemeMode = (v: unknown): v is ThemeMode => v === "dark" || v === "light" || v === "system";

function subscribeSystem(fn: () => void) {
  const q = media();
  q?.addEventListener("change", fn);
  return () => q?.removeEventListener("change", fn);
}

export function useSystemTheme(): Theme {
  return useSyncExternalStore(subscribeSystem, systemTheme, () => "dark");
}

export function useResolvedTheme(mode: ThemeMode | undefined): Theme | undefined {
  const sys = useSystemTheme();
  return mode === "system" ? sys : mode;
}

function subscribeDocument(fn: () => void) {
  if (typeof document === "undefined") return () => undefined;
  const mo = new MutationObserver(fn);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
  const off = subscribeSystem(fn);
  return () => { mo.disconnect(); off(); };
}
const documentTheme = (): string => (typeof document === "undefined" ? "" : `${document.documentElement.getAttribute("data-theme") ?? ""}|${document.documentElement.className}|${systemTheme()}`);

export function useDocumentTheme(): string {
  return useSyncExternalStore(subscribeDocument, documentTheme, () => "");
}

function readMode(key: string, fallback: ThemeMode): ThemeMode {
  try { const v = localStorage.getItem(key); return isThemeMode(v) ? v : fallback; } catch { return fallback; }
}

export function applyDocumentTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}

export function useThemeMode(key = THEME_KEY, fallback: ThemeMode = "system") {
  const [mode, setModeState] = useState<ThemeMode>(() => readMode(key, fallback));
  const theme = useResolvedTheme(mode)!;
  useEffect(() => { applyDocumentTheme(theme); }, [theme]);
  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try { localStorage.setItem(key, m); } catch {}
  }, [key]);
  return { mode, theme, setMode };
}

export interface CanvasColors {
  text: string;
  grid: string;
  border: string;
  separatorHover: string;
  crosshair: string;
  crosshairLabel: string;
  bg: string;
}

export function canvasColors(el: Element): CanvasColors {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    text: v("--chart-text", "#8b98a8"),
    grid: v("--chart-grid", "#1f2834"),
    border: v("--divider", v("--border", "#2b3644")),
    separatorHover: v("--chart-separator-hover", "rgba(242,181,68,0.25)"),
    crosshair: v("--chart-crosshair", "#9598a1"),
    crosshairLabel: v("--chart-crosshair-label", "#131722"),
    bg: v("--bg", "#151b23"),
  };
}
