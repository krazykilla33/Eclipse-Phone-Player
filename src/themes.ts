import type { Theme } from "./types";

export const themes: Theme[] = [
  { name: "Midnight Glass", background: "#050817", surface: "#10162c", surfaceStrong: "#171f3d", field: "#080d20", text: "#f6f8ff", muted: "#9aa7cc", accent: "#24d7ff", accent2: "#7456ff", selected: "#202f68", danger: "#ff5d86", success: "#42efb5", glow: 70, blur: 24 },
  { name: "Emerald Pulse", background: "#04110d", surface: "#0b2119", surfaceStrong: "#103126", field: "#061710", text: "#edfff7", muted: "#8fb9a7", accent: "#35f2a2", accent2: "#00a879", selected: "#174b39", danger: "#ff6685", success: "#63ffc1", glow: 64, blur: 22 },
  { name: "Crimson Noir", background: "#12060b", surface: "#261019", surfaceStrong: "#361523", field: "#16080e", text: "#fff3f6", muted: "#c49aa7", accent: "#ff4f82", accent2: "#a81748", selected: "#5a1c35", danger: "#ff365f", success: "#65e6a2", glow: 58, blur: 20 },
  { name: "Amber Terminal", background: "#120e04", surface: "#251d0c", surfaceStrong: "#352914", field: "#171005", text: "#fff8df", muted: "#cbb77d", accent: "#ffc83d", accent2: "#d17b00", selected: "#59430e", danger: "#ff647f", success: "#a6e94d", glow: 48, blur: 18 },
  { name: "Arctic", background: "#e8eef7", surface: "#ffffff", surfaceStrong: "#dce6f4", field: "#f7faff", text: "#142039", muted: "#60708c", accent: "#1977ff", accent2: "#6748e8", selected: "#cddcff", danger: "#d62955", success: "#159b67", glow: 35, blur: 18 }
];

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const map: Record<string, string | number> = {
    bg: theme.background, surface: theme.surface, "surface-strong": theme.surfaceStrong,
    field: theme.field, text: theme.text, muted: theme.muted, accent: theme.accent,
    "accent-2": theme.accent2, selected: theme.selected, danger: theme.danger,
    success: theme.success, glow: theme.glow, blur: theme.blur
  };
  for (const [key, value] of Object.entries(map)) root.style.setProperty(`--${key}`, typeof value === "number" ? String(value) : value);
}
