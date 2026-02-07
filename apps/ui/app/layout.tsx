import "../styles/globals.css";
import type { ReactNode } from "react";
import { SystemThemeEffect } from "@/components/theme/SystemThemeEffect";
import { OfflineBanner } from "@/components/system/OfflineBanner";

export const metadata = {
  title: "NT2 Training",
  description:
    "Leer de NT2 woorden met een Supabase-gestuurde training. Zet Luistermodus (🎧) aan en tik op een woord in een voorbeeldzin om uitspraak te horen.",
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
        {/* iOS PWA splash screens (portrait). */}
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1290x2796.png"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1179x2556.png"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1284x2778.png"
          media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1170x2532.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1125x2436.png"
          media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1242x2688.png"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-828x1792.png"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-2048x2732.png"
          media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1668x2388.png"
          media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-touch-startup-image-1620x2160.png"
          media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
      </head>
      <body className="min-h-screen bg-background-light text-slate-900 dark:bg-background-dark dark:text-white">
        <SystemThemeEffect />
        <OfflineBanner />
        {children}
      </body>
    </html>
  );
}
