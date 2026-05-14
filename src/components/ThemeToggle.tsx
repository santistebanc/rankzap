import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Mode = "light" | "dark";

const STORAGE_KEY = "rankzap:theme";

function getEffective(): Mode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const THEME_COLORS: Record<Mode, string> = {
  light: "#f4f0e6",
  dark: "#1c1a17",
};

function applyTheme(mode: Mode) {
  const html = document.documentElement;
  html.classList.remove("light", "dark");
  html.classList.add(mode);
  try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  // Keep browser chrome in sync with forced theme.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((el) => {
    el.setAttribute("content", THEME_COLORS[mode]);
  });
}

export function ThemeToggle({ style }: { style?: React.CSSProperties }) {
  const [mode, setMode] = useState<Mode>(getEffective);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      try {
        if (!localStorage.getItem(STORAGE_KEY)) setMode(mq.matches ? "dark" : "light");
      } catch {}
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = () => {
    const next: Mode = mode === "dark" ? "light" : "dark";
    applyTheme(next);
    setMode(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="transition-colors hover:bg-surface-2 hover:text-text"
      style={style}
    >
      {mode === "dark" ? (
        <Sun className="size-4" strokeWidth={2} aria-hidden />
      ) : (
        <Moon className="size-4" strokeWidth={2} aria-hidden />
      )}
    </button>
  );
}
