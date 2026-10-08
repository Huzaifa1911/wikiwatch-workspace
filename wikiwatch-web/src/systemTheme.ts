export type ThemePreference = "system" | "light" | "dark";
export const THEME_KEY = "wikiwatch-theme";
let snapshot = "system:light";
let changePreference: ((value: ThemePreference) => void) | undefined;
const listeners = new Set<() => void>();
export const subscribeTheme = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getThemeSnapshot = () => snapshot;
export function setThemePreference(value: ThemePreference) {
  changePreference?.(value);
}

// Initialize before rendering. An explicit preference takes precedence over the OS.
export function followSystemTheme(
  browser: Pick<Window, "matchMedia"> & Partial<Pick<Window, "localStorage" | "addEventListener" | "removeEventListener">> = window,
  root: Pick<HTMLElement, "classList" | "style"> = document.documentElement,
) {
  const media = browser.matchMedia("(prefers-color-scheme: dark)");
  const read = (): ThemePreference => {
    try {
      const value = browser.localStorage?.getItem(THEME_KEY);
      return value === "dark" || value === "light" ? value : "system";
    } catch { return "system"; }
  };
  let preference = read();
  const apply = () => {
    const dark = preference === "dark" || (preference === "system" && media.matches);
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
    const next = `${preference}:${dark ? "dark" : "light"}`;
    if (snapshot !== next) { snapshot = next; listeners.forEach(listener => listener()); }
  };
  const set = (value: ThemePreference) => {
    preference = value;
    try {
      if (value === "system") browser.localStorage?.removeItem(THEME_KEY);
      else browser.localStorage?.setItem(THEME_KEY, value);
    } catch { /* The choice still works in this tab when storage is unavailable. */ }
    apply();
  };
  changePreference = set;
  const storageChanged = (event: Event) => {
    const key = (event as StorageEvent).key;
    if (key === THEME_KEY || key === null) { preference = read(); apply(); }
  };
  apply();
  media.addEventListener("change", apply);
  browser.addEventListener?.("storage", storageChanged);
  return () => {
    media.removeEventListener("change", apply);
    browser.removeEventListener?.("storage", storageChanged);
    if (changePreference === set) changePreference = undefined;
  };
}
