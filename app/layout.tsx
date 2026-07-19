
// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Logo } from "../components/Logo";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RAP Sleep Lab",
  description: "Comfort Guarantee claims, warranty service, and better sleep support",
  manifest: "/manifest.json",
  themeColor: "#0B1D36",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#F8F5F0] text-[#0B1D36] min-h-screen`}>
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/">
              <Logo size={40} />
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link href="/claim" className="hover:text-blue-800">Start Claim</Link>
              <Link href="/claims" className="hover:text-blue-800">My Claims</Link>
              <Link href="/care" className="hover:text-blue-800">Care Tips</Link>
              <Link href="/admin" className="text-slate-500 hover:text-blue-800">Admin</Link>
            </nav>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-200 mt-16 py-8 text-center text-sm text-slate-500">
          <p>RAP Sleep Lab · Support: 1-800-RAP-SLEEP · support@rapsleeplab.com</p>
          <p className="mt-1">$99 restocking fee applies to comfort exchanges. <a href="/terms" className="underline">View full 90-Night Comfort Guarantee</a></p>
        </footer>
      </body>
    </html>
  );
}
