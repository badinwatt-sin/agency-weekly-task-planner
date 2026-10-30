import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

// Every page is rendered per request: content is private and the CSP nonce changes each time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Agency Weekly Task Planner", template: "%s · Weekly Task Planner" },
  description: "Private team planning board",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1f3a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plex.variable}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
