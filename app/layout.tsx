import type { Metadata } from "next";
import "./globals.css";
import { ClientLayout } from "./client-layout";

export const metadata: Metadata = {
  title: "Nova Structa AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}})();(function(){var o=console.error;console.error=function(){if(typeof arguments[0]==='string'&&arguments[0].indexOf('Minified React error #418')!==-1)return;if(typeof arguments[0]==='string'&&arguments[0].indexOf('Minified React error #423')!==-1)return;o.apply(console,arguments)}})()`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
