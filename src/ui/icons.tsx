import type { ReactNode } from "react";

// 操作ボタン用の線アイコン。水槽の見た目ではなく UI の記号なので、コードで描く。
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      {children}
    </svg>
  );
}

export const BackIcon = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const ChevronLeftIcon = () => <Icon><path d="M14 7l-5 5 5 5" /></Icon>;
export const ChevronRightIcon = () => <Icon><path d="M10 7l5 5-5 5" /></Icon>;
export const CloseIcon = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const PlusIcon = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const MinusIcon = () => <Icon><path d="M5 12h14" /></Icon>;
export const SettingsIcon = () => (
  <Icon>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Icon>
);
export const ExpandIcon = () => (
  <Icon><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Icon>
);
export const CollapseIcon = () => (
  <Icon><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></Icon>
);
export const FitIcon = () => (
  <Icon><rect height="12" rx="2" width="16" x="4" y="6" /></Icon>
);
export const CheckIcon = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
// 館内図。階を重ねた断面の記号。
export const MapIcon = () => (
  <Icon><path d="M4 5h16M4 10h16M4 15h16M4 20h16" /><path d="M8 5v15" /></Icon>
);
