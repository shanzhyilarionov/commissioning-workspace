export type AppTheme = "system" | "light" | "dark";
export type ResolvedAppTheme = Exclude<AppTheme, "system">;

const THEME_STORAGE_KEY = "commissioning-workspace.theme";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_THEME: AppTheme = "system";

function isAppTheme(value: string | null): value is AppTheme {
  return value === "system" || value === "light" || value === "dark";
}

export function getStoredTheme(): AppTheme {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isAppTheme(storedTheme) ? storedTheme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function getSystemTheme(): ResolvedAppTheme {
  try {
    return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(theme: AppTheme): ResolvedAppTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyResolvedTheme(theme: ResolvedAppTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function applyTheme(theme: AppTheme): void {
  applyResolvedTheme(resolveTheme(theme));
}

export function initializeTheme(): AppTheme {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}

export function saveTheme(theme: AppTheme): void {
  applyTheme(theme);

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    return;
  }
}

export function watchSystemTheme(theme: AppTheme): () => void {
  applyTheme(theme);

  if (theme !== "system") {
    return () => undefined;
  }

  let mediaQuery: MediaQueryList;

  try {
    mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
  } catch {
    return () => undefined;
  }

  const handleChange = (event: MediaQueryListEvent) => {
    applyResolvedTheme(event.matches ? "dark" : "light");
  };

  mediaQuery.addEventListener("change", handleChange);

  return () => {
    mediaQuery.removeEventListener("change", handleChange);
  };
}
