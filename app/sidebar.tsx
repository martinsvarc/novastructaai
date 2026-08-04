"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

export function Sidebar() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);
  const { t, lang, setLang } = useI18n();

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "dark" | "light" | null;
    const initial = stored || "dark";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
    setMounted(true);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="tag">{t.voiceAi}</div>
        <h1 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--whiskey)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Nova Structa
        </h1>
      </div>

      <div className="nav">
        <Link
          href="/"
          className={`nav-item ${pathname === "/" ? "active" : ""}`}
        >
          <span className="nav-dot"></span>
          {t.callLog}
        </Link>
        <Link
          href="/channels"
          className={`nav-item ${pathname === "/channels" ? "active" : ""}`}
        >
          <span className="nav-dot"></span>
          Channels
        </Link>
        <Link
          href="/settings"
          className={`nav-item ${pathname === "/settings" ? "active" : ""}`}
        >
          <span className="nav-dot"></span>
          {t.settings}
        </Link>
        <Link
          href="/configuration"
          className={`nav-item ${pathname === "/configuration" ? "active" : ""}`}
        >
          <span className="nav-dot"></span>
          {t.scriptEditor}
        </Link>
      </div>

      <div className="sidebar-footer">
        <div className="status-row">
          <div className="status-dot"></div>
          {t.agentOnline}
        </div>

        <button className="theme-toggle" onClick={toggleTheme} suppressHydrationWarning>
          {mounted ? (
            theme === "dark" ? (
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )
          ) : null}
          {mounted ? (theme === "dark" ? t.lightMode : t.darkMode) : ""}
        </button>
      </div>
    </nav>
  );
}
