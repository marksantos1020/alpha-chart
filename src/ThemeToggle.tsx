import type { Theme, ThemeMode } from "./theme";

const SUN = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);
const MOON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export default function ThemeToggle({ theme, onChange, className = "btn tool icon" }: { theme: Theme; onChange: (mode: ThemeMode) => void; className?: string }) {
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className={`${className} theme-toggle`} onClick={() => onChange(next)} title={`Switch to ${next} theme`} aria-label={`Switch to ${next} theme`} data-theme-current={theme}>
      {theme === "dark" ? SUN : MOON}
    </button>
  );
}
