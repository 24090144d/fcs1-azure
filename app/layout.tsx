import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Incident Analytics Dashboard",
  description: "Enterprise incident management analytics — upload, explore, and report.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-parchment-100 antialiased">{children}</body>
    </html>
  );
}
