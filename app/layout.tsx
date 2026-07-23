import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { THEME_STORAGE_KEY } from "@/app/hooks/use-theme";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "CV Screener",
  description: "RAG-powered chat over generated CVs",
};

// Mirrors resolveInitialTheme() in app/hooks/use-theme.ts exactly, so the two can never
// disagree. Runs synchronously during HTML parsing, before first paint — see
// node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`h-full antialiased ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-canvas font-mono text-ink">
        {children}
      </body>
    </html>
  );
}
