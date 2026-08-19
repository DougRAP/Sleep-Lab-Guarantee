import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
import { AppFooter } from "../components/nav/app-footer";
import { DemoControls } from "../components/demo/demo-controls";
import "./globals.css";

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  style: ["normal", "italic"],
});
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RAP Sleep Lab",
  description: "A calmer path to better sleep — your 90-night companion.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sleep Lab",
  },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0E1420",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="min-h-[100dvh] font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-dawn focus:px-4 focus:py-2 focus:text-[#241a12]"
        >
          Skip to content
        </a>
        {children}
        {/* R-1 (Doug, 2026-08-19): chrome underfoot on every surface, not just
            inside the app/(app) group. Both render nothing where they do not
            belong: AppFooter via footerPlan(), DemoControls unless demo mode is
            explicitly on AND the surface has a bar.

            Suspense is not decoration. Both resolve the session, and an async
            child of <body> holds the whole root shell until it settles, which
            would put every loading.tsx skeleton behind an auth round-trip and
            undo the B-18 ghost-loading work. Fallback is null because the bar
            is fixed chrome: nothing reflows when it arrives late. */}
        <Suspense fallback={null}>
          <DemoControls />
          <AppFooter />
        </Suspense>
      </body>
    </html>
  );
}
