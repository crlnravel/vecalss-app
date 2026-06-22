import type { Metadata } from "next";
import { Manrope, Plus_Jakarta_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-voyage-sans",
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-voyage-display",
});

const sportsWorld = localFont({
  src: "./fonts/Sports World-Regular.ttf",
  display: "swap",
  variable: "--font-sports-world",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Vecalss Learning Academy | Misi Belajar Konsisten Menuju PTN",
  description:
    "Vecalss mendampingi siswa Indonesia menyiapkan perjalanan menuju PTN melalui struktur belajar, konsistensi, dan mentoring yang terarah.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${jakarta.variable} ${manrope.variable} ${sportsWorld.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
