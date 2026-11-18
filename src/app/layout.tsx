import type { Metadata, Viewport } from "next";
import { DemoPanel } from "@/components/demo-panel";
import { getDemoPanel } from "@/domain/demo-clock";
import { getDeps } from "@/server/deps";
import "./globals.css";

// Every page shows live status, so nothing is prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Presentkortsmarknaden",
  description: "Köp och sälj presentkort med rabatt (prototyp med simulerade steg).",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // In demoläge every page, for every visitor, carries the demo panel; otherwise none.
  const panel = getDemoPanel(getDeps());
  return (
    <html lang="sv">
      <body>
        {panel && <DemoPanel panel={panel} />}
        {children}
      </body>
    </html>
  );
}
