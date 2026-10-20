import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeCtx = createContext({});

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return true; // build-time pre-render
    const saved = localStorage.getItem("keli-theme");
    return saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("keli-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <ThemeCtx.Provider value={{ dark, toggle: () => setDark(p => !p) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
