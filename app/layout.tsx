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

// Only acts when there's an explicit stored choice to enforce — the no-preference default is
// handled entirely by CSS (`@media (prefers-color-scheme: dark)` in globals.css), which the
// browser evaluates during initial style computation with zero JS involvement, so there's
// nothing to correct and nothing that can flash in the common case. Runs synchronously during
// HTML parsing, before first paint, for the minority case where a stored choice needs to
// override the OS default — see
// node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full antialiased ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      {/* suppressHydrationWarning here is unrelated to theming — it silences the mismatch
          browser extensions (Grammarly, etc.) cause by injecting attributes like
          data-gr-ext-installed onto <body> before React hydrates; see
          https://nextjs.org/docs/messages/react-hydration-error */}
      <body
        suppressHydrationWarning
        className="flex min-h-full flex-col bg-canvas font-mono text-ink"
      >
        {children}
      </body>
    </html>
  );
}
