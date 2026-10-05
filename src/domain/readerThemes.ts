import type { ReaderPreferences } from "./models";

export const READER_THEMES: Record<ReaderPreferences["theme"], { background: string; surface: string; color: string; border: string }> = {
  light: { background: "#f4f7fb", surface: "244, 247, 251", color: "#283548", border: "#cbd5e1" },
  dark: { background: "#dce4ef", surface: "220, 228, 239", color: "#263449", border: "#b8c6d8" },
  sepia: { background: "#f5efdf", surface: "245, 239, 223", color: "#514632", border: "#d8ccb0" },
};
