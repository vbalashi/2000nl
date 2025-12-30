import "../styles/globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "NT2 Training",
  description: "Leer de NT2 woorden met een Supabase-gestuurde training."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body className="min-h-screen bg-background-light text-slate-900 dark:bg-background-dark dark:text-white">
        {children}
      </body>
    </html>
  );
}
