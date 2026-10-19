export interface BlockClock { ms: number; name?: string }

export function countdownText(msLeft: number, mode: "time" | "blocks", block?: BlockClock): string {
  const blocks = mode === "blocks" && !!block;
  if (msLeft <= 0) return blocks ? "closing" : "00:00";
  if (blocks) { const b = Math.ceil(msLeft / block.ms), n = block.name ?? "block"; return `${b} ${n}${b === 1 ? "" : "s"}`; }
  const s = Math.ceil(msLeft / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}
