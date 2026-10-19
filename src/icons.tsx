import type { ReactNode } from "react";

const icon = (children: ReactNode, size = 28) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const IndicatorsIcon = () => icon(<><path d="M5 22.5h18" /><path d="M6 18.5c3-1 4.5-9 8-9s4 5.5 8.5 4" /><path d="M8 22.5v-4M12 22.5v-6M16 22.5v-5M20 22.5v-7" opacity="0.45" /></>);
export const TemplatesIcon = () => icon(<><rect x="6.5" y="6.5" width="6" height="6" rx="1.5" /><rect x="15.5" y="6.5" width="6" height="6" rx="1.5" /><rect x="6.5" y="15.5" width="6" height="6" rx="1.5" /><rect x="15.5" y="15.5" width="6" height="6" rx="1.5" /></>);
export const UndoIcon = () => icon(<path d="M9.5 9.5L6 13l3.5 3.5M6.5 13H17a4.5 4.5 0 0 1 0 9h-3" />);
export const RedoIcon = () => icon(<path d="M18.5 9.5L22 13l-3.5 3.5M21.5 13H11a4.5 4.5 0 0 0 0 9h3" />);
export const GoToIcon = () => icon(<><rect x="5.5" y="7.5" width="17" height="14" rx="1.5" /><path d="M5.5 11.5h17M10 5.5v3M18 5.5v3" /><path d="M11 16.5h6M15 14.5l2 2-2 2" /></>);
export const ResetIcon = () => icon(<><path d="M20.5 10A7.5 7.5 0 1 0 21.5 15" /><path d="M21 5.5V10h-4.5" /></>);
export const SettingsIcon = () => icon(<><circle cx="14" cy="14" r="2.75" /><path d="M14 5.5l1.6 2.2 2.6-.7.6 2.6 2.6.7-.7 2.6 2.1 1.6-2.1 1.6.7 2.6-2.6.7-.6 2.6-2.6-.7L14 22.5l-1.6-2.2-2.6.7-.6-2.6-2.6-.7.7-2.6L5.5 14l2.2-1.6-.7-2.6 2.6-.7.6-2.6 2.6.7z" /></>);
export const Chevron = ({ up = false, size = 15 }: { up?: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={up ? "M4.5 10l3.5-3.5 3.5 3.5" : "M4.5 6.5L8 10l3.5-3.5"} />
  </svg>
);
