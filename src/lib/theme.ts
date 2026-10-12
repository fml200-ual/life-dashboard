export type Theme = "light" | "dark" | "system";

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") {
    return;
  }

  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);

  document.documentElement.classList.toggle("dark", dark);
}

export const THEME_STORAGE_KEY = "ld-theme";
