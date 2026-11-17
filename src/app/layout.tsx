import type { Metadata, Viewport } from "next";
import "./globals.css";

// Every page shows live status, so nothing is prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Presentkortsmarknaden",
  description: "Köp och sälj presentkort med rabatt (prototyp med simulerade steg).",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
