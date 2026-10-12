"use client";

import { useEffect } from "react";

import { applyTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

/**
 * Aplica en el cliente el tema guardado en el servidor (preferencias del
 * usuario) para que la elección se conserve entre dispositivos.
 */
export function ThemeSync({ theme }: { theme: "LIGHT" | "DARK" | "SYSTEM" }) {
  useEffect(() => {
    if (localStorage.getItem(THEME_STORAGE_KEY)) {
      return;
    }

    const value = theme.toLowerCase() as Theme;
    localStorage.setItem(THEME_STORAGE_KEY, value);
    applyTheme(value);
  }, [theme]);

  return null;
}
