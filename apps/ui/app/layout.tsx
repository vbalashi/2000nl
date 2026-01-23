import "../styles/globals.css";
import type { ReactNode } from "react";
import { SystemThemeEffect } from "@/components/theme/SystemThemeEffect";
import { OfflineBanner } from "@/components/system/OfflineBanner";

export const metadata = {
  title: "NT2 Training",
  description: "Leer de NT2 woorden met een Supabase-gestuurde training.",
  manifest: "/manifest.json"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <meta name="theme-color" content="#0f172a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="2000nl" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className="min-h-screen bg-background-light text-slate-900 dark:bg-background-dark dark:text-white">
        <SystemThemeEffect />
        <OfflineBanner />
        {children}
      </body>
    </html>
  );
}
