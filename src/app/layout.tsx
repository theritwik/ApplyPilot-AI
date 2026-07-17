import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "ApplyPilot AI",
  description: "AI-assisted, human-approved resume tailoring and application tracking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
