import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "DocLens",
  description:
    "Turn invoices and receipts into structured data, with every value traced back to where it was found.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
