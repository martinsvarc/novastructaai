"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { I18nProvider } from "@/lib/i18n";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (isLogin) {
    return <>{children}</>;
  }

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
            <img src="/logo-dark.svg" alt="Nova Structa" className="logo-img" />
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
