"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/components/theme-provider";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";

function AppearanceIcon({ preference }: { preference: ThemePreference }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {preference === "system" ? (
        <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>
      ) : preference === "dark" ? (
        <path d="M20.5 13.1A9 9 0 0 1 10.9 3.5a9 9 0 1 0 9.6 9.6Z" />
      ) : (
        <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>
      )}
    </svg>
  );
}

export function ThemeToggle({ label, labels }: {
  label: string;
  labels: Record<ThemePreference, string>;
}) {
  const { preference, choose } = useTheme();
  const menuRef = useRef<HTMLDetailsElement>(null);

  function close(restoreFocus = false) {
    const menu = menuRef.current;
    if (!menu) return;
    menu.open = false;
    if (restoreFocus) menu.querySelector("summary")?.focus({ preventScroll: true });
  }

  useEffect(() => {
    function outside(event: PointerEvent) {
      const menu = menuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && menuRef.current?.open) {
        event.preventDefault();
        close(true);
      }
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <details ref={menuRef} className="relative shrink-0">
      <summary
        aria-label={label}
        title={`${label} : ${labels[preference]}`}
        className="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl text-on-chrome transition hover:bg-on-chrome/10 lg:px-2 [&::-webkit-details-marker]:hidden"
      >
        <AppearanceIcon preference={preference} />
        <span className="hidden text-sm font-semibold lg:inline">{label}</span>
      </summary>
      <div role="group" aria-label={label} className="absolute right-0 top-full z-50 mt-2 w-48 rounded-2xl border border-line bg-surface p-2 text-cloud shadow-xl">
        {THEME_PREFERENCES.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={preference === mode}
            onClick={() => { choose(mode); close(true); }}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition hover:bg-brand/10 aria-pressed:bg-brand/10 aria-pressed:font-semibold"
          >
            <AppearanceIcon preference={mode} />
            <span className="flex-1">{labels[mode]}</span>
            {preference === mode && <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m4 10 4 4 8-8" /></svg>}
          </button>
        ))}
      </div>
    </details>
  );
}
