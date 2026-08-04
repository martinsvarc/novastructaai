"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { I18nProvider } from "@/lib/i18n";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render a minimal shell on the server / before hydration.
  // Once mounted on the client, render the full UI with i18n + sidebar.
  // This prevents hydration mismatches from localStorage-based state
  // and browser extensions (GHL, etc.) injecting DOM nodes.
  if (!mounted) {
    return (
      <div className="layout">
        <nav className="sidebar">
          <div className="sidebar-brand">
            <div className="tag">novastructa.com</div>
            <h1 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--whiskey)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Nova Structa
            </h1>
          </div>
        </nav>
        <main className="main">{children}</main>
      </div>
    );
  }

  return (
    <I18nProvider>
      <div className="layout">
        <Sidebar />
        <main className="main">{children}</main>
      </div>
      <div className="toast" id="toast">
        <div className="toast-dot"></div>
        <span id="toast-msg">Settings saved</span>
      </div>
    </I18nProvider>
  );
}
