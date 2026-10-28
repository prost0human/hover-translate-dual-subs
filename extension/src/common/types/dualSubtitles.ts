/** Opt-in settings kept separately from the original settings and their migrations. */
export interface DualSubtitleSettings {
  enabled: boolean;
  showRussian: boolean;
  crossHighlight: boolean;
  fontSize: number;
  textOpacity: number;
  backgroundOpacity: number;
  verticalGap: number;
}

export const DUAL_SETTINGS_KEY = "dualSubtitleSettings";

export const defaultDualSubtitleSettings: DualSubtitleSettings = {
  enabled: false,
  showRussian: true,
  crossHighlight: true,
  fontSize: 22,
  textOpacity: 100,
  backgroundOpacity: 75,
  verticalGap: 6,
};

/** Tolerate old, partial or malformed synced settings without breaking captions. */
export function normalizeDualSettings(value: Partial<DualSubtitleSettings> | null | undefined): DualSubtitleSettings {
  const bounded = (item: unknown, fallback: number, min: number, max: number) =>
    typeof item === "number" && Number.isFinite(item) ? Math.max(min, Math.min(max, item)) : fallback;
  const flag = (item: unknown, fallback: boolean) => typeof item === "boolean" ? item : fallback;
  return {
    enabled: flag(value?.enabled, false),
    showRussian: flag(value?.showRussian, true),
    crossHighlight: flag(value?.crossHighlight, true),
    fontSize: bounded(value?.fontSize, 22, 12, 48),
    textOpacity: bounded(value?.textOpacity, 100, 25, 100),
    backgroundOpacity: bounded(value?.backgroundOpacity, 75, 0, 100),
    verticalGap: bounded(value?.verticalGap, 6, 0, 80),
  };
}
