"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "@/components/ui/icons";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Reads the theme the mount-time inline script (app/layout.tsx) already
    // applied to <html> — genuinely syncing from an external DOM attribute,
    // not state we could derive during render.
    const current = document.documentElement.getAttribute("data-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("wc-theme", next);
    } catch {
      // storage unavailable — theme still applies for this view
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-border-default text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
