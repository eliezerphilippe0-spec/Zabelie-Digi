export const THEME_COOKIE = "zab_theme";
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export function readThemePreference(value: string | undefined): ThemePreference {
  return value === "dark" || value === "system" ? value : "light";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean) {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

// Static code only: the system preference must be resolved before the body is
// painted, including when the device changed appearance since the last visit.
export const THEME_INIT_SCRIPT = `(() => {
  const root = document.documentElement;
  if (root.dataset.themePreference === "system") {
    root.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
})();`;
