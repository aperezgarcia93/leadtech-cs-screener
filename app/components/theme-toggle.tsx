"use client";

import { useTheme } from "@/app/hooks/use-theme";

export function ThemeToggle() {
  const { toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      title="Toggle theme"
      aria-label="Toggle theme"
      className="rounded border border-hairline-strong px-3 py-1.5 text-sm hover:bg-surface-soft"
    >
      <span className="theme-toggle-icon-light" aria-hidden="true">
        ☀
      </span>
      <span className="theme-toggle-icon-dark" aria-hidden="true">
        ☾
      </span>
    </button>
  );
}
