import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Locale } from "./data";
const Context = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  theme: string;
  setTheme: (t: string) => void;
  t: (zh: string, en: string) => string;
}>(null!);
function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Theme and language still work for this tab. */
  }
}
export function Preferences({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(
    stored("pai-language") === "en" ? "en" : "zh",
  );
  const [theme, setTheme] = useState(
    stored("pai-theme") === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    remember("pai-language", locale);
    document.documentElement.lang = locale === "zh" ? "zh-Hans" : "en";
  }, [locale]);
  useEffect(() => {
    remember("pai-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return (
    <Context.Provider
      value={{
        locale,
        setLocale,
        theme,
        setTheme,
        t: (zh, en) => (locale === "zh" ? zh : en),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const usePreferences = () => useContext(Context);
