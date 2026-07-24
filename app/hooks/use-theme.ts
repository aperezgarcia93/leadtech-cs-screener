"use client";

import { useCallback, useEffect, useState } from "react";

export const THEME_STORAGE_KEY = "cv-screener:theme";

export type Theme = "light" | "dark";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
  }
}

function matchMediaTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return null;
  }
}

// Only used to seed React state (for toggle's "next value" computation) — first-paint
// correctness doesn't depend on this at all, since CSS resolves the OS-driven default before
// this ever runs. Falls back to "light" in the same order CSS itself would: no stored value,
// no OS signal available -> the bare :root default, which is light.
export function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? matchMediaTheme() ?? "light";
}

export interface UseThemeResult {
  theme: Theme;
  toggle: () => void;
}

export function useTheme(): UseThemeResult {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      writeStoredTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
