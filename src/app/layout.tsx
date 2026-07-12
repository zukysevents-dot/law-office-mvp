import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "syndikat.legal",
    template: "%s — syndikat.legal",
  },
  description: "Interní právní systém syndikat.legal",
};

export const viewport: Viewport = {
  themeColor: "#072924",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" className="h-full">
      <body className="min-h-full antialiased">
        {children}
      </body>
    </html>
  );
}
