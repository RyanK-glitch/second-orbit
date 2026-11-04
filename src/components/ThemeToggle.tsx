"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./icons";

/**
 * Follows the system setting until the visitor chooses, then remembers that choice in this browser.
 * The script in layout.tsx applies the theme before first paint; this keeps it in step afterwards.
 */
const KEY = "theme";
const CHANGED = "themechange";

function stored() {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null; // Storage can be blocked. The toggle still works until the page reloads.
  }
}

function apply(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  const system = matchMedia("(prefers-color-scheme: dark)");
  // If React ever has to rebuild the document after a hydration error, it drops the attribute the
  // inline script set. Without this, the page would silently fall back to the light theme.
  if (!document.documentElement.dataset.theme) apply(stored() ?? (system.matches ? "dark" : "light"));
  const onSystem = () => {
    if (!stored()) apply(system.matches ? "dark" : "light");
  };
  // Fires in other tabs, so they all switch together.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) apply(stored() ?? (system.matches ? "dark" : "light"));
  };
  system.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGED, onChange);
  return () => {
    system.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGED, onChange);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === "dark", () => false);
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      aria-label="Dark mode"
      aria-pressed={dark}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        try {
          localStorage.setItem(KEY, next);
        } catch {
          // Blocked storage: apply it for this page anyway.
        }
        apply(next);
      }}
    >
      <SunIcon />
      <MoonIcon />
    </button>
  );
}
