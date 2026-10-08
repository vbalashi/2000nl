import "../styles/globals.css";
import { startupAppearanceBootstrap } from "@/lib/preferences/startupAppearance";
import type { ReactNode } from "react";
import type { Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import { SystemThemeEffect } from "@/components/theme/SystemThemeEffect";
import { OfflineBanner } from "@/components/system/OfflineBanner";
import { DiagnosticReportOutboxBootstrap } from "@/components/feedback/DiagnosticReportOutboxBootstrap";

const senseSans = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sense-sans",
  display: "swap",
});

const senseSerif = Newsreader({
  subsets: ["latin"],
  variable: "--font-sense-serif",
  style: ["normal", "italic"],
  display: "swap",
  adjustFontFallback: false,
});

export const metadata = {
  title: "NT2 Training",
  description:
    "Leer de NT2 woorden met een Supabase-gestuurde training. Zet Luistermodus (🎧) aan en tik op een woord in een voorbeeldzin om uitspraak te horen.",
  manifest: "/manifest.json",
  icons: { icon: "/icons/favicon-v2.ico" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning lang="nl" className={`${senseSans.variable} ${senseSerif.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: startupAppearanceBootstrap }} />
        <meta name="theme-color" content="#202124" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="2000nl" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon-v2.png" />
        {/* iOS PWA splash screens (portrait). */}
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1290x2796-v2.png"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1179x2556-v2.png"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1284x2778-v2.png"
          media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1170x2532-v2.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1125x2436-v2.png"
          media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1242x2688-v2.png"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-828x1792-v2.png"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-2048x2732-v2.png"
          media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1668x2388-v2.png"
          media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1620x2160-v2.png"
          media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
      </head>
      <body className="min-h-screen bg-background-light text-slate-900 dark:bg-background-dark dark:text-white">
        <SystemThemeEffect />
        <OfflineBanner />
        <DiagnosticReportOutboxBootstrap />
        {children}
      </body>
    </html>
  );
}
