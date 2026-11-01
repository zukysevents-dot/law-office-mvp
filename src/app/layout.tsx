import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "IURIVERSE",
    template: "%s — IURIVERSE",
  },
  description: "Softwarový systém pro advokátní kanceláře",
};

export const viewport: Viewport = {
  themeColor: "#0e1822",
  // Jen světlý vzhled: formulářové prvky ani rozbalovací seznamy se nesmí
  // přepnout do tmavého systémového vzhledu (viz option v globals.css).
  colorScheme: "light",
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
