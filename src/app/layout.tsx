import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "syndikat.legal",
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
    <html
      lang="cs"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden`}
    >
      <body className="min-h-full overflow-x-hidden antialiased">
        {children}
      </body>
    </html>
  );
}
