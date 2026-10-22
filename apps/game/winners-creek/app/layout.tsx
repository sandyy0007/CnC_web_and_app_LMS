import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Self-hosted (npm-bundled) font files — no build-time fetch to Google
// Fonts, so the build never depends on outbound network access.
const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "Winners Creek",
  description: "Winners Creek — AI Soft Skills Simulation Lab",
};

// Runs before paint to avoid a light/dark flash; reads the viewer's saved
// preference only (never a value Claude or the server can see).
const THEME_INIT = `
(function () {
  try {
    var saved = window.localStorage.getItem("wc-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col bg-surface-0 text-ink-primary">{children}</body>
    </html>
  );
}
