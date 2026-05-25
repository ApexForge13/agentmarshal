import type { Metadata } from "next";
import "./globals.css";

// Typography (Inter + JetBrains Mono) and the warm near-black background are
// owned by the Echo OS design system in globals.css — no next/font, no body
// utility classes, no shadcn `dark` variant. The shell sets its own height.

export const metadata: Metadata = {
  title: "AgentMarshal — Trading Desk",
  description:
    "Compliance and governance layer for autonomous AI agent fleets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
