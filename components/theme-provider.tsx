"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { THEME_COOKIE, resolveTheme, type ThemePreference } from "@/lib/theme";

const ThemeContext = createContext<{
  preference: ThemePreference;
  choose: (preference: ThemePreference) => void;
} | null>(null);

export function ThemeProvider({ initialPreference, children }: {
  initialPreference: ThemePreference;
  children: ReactNode;
}) {
  const [preference, setPreference] = useState(initialPreference);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(preference, media.matches);
    };
    apply();
    if (preference !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  function choose(next: ThemePreference) {
    document.documentElement.dataset.theme = resolveTheme(
      next, window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
    document.documentElement.dataset.themePreference = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setPreference(next);
  }

  // The root provider survives client navigation, including pages without a
  // header. Changing appearance never reloads a form or restarts a request.
  return <ThemeContext.Provider value={{ preference, choose }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider is required");
  return value;
}
