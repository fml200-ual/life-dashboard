"use client";

import { useSyncExternalStore } from "react";

import { updateThemeAction } from "@/app/actions/settings";
import { applyTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const NEXT_THEME: Record<Theme, Theme> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const LABEL: Record<Theme, string> = {
  light: "Claro",
  dark: "Oscuro",
  system: "Sistema",
};

const ICON: Record<Theme, string> = {
  light: "☀️",
  dark: "🌙",
  system: "🖥️",
};

function getStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return "system";
  }

  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

function subscribeToTheme(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

export function ThemeToggle() {
  const theme: Theme = useSyncExternalStore<Theme>(
    subscribeToTheme,
    getStoredTheme,
    () => "system",
  );

  function handleClick() {
    const next = NEXT_THEME[theme];
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
    window.dispatchEvent(new Event("storage"));
    void updateThemeAction(next.toUpperCase());
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Tema: ${LABEL[theme]}`}
      aria-label={`Cambiar tema (actual: ${LABEL[theme]})`}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted"
    >
      <span aria-hidden>{ICON[theme]}</span>
      <span className="hidden sm:inline">{LABEL[theme]}</span>
    </button>
  );
}