import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "SST™ · מערכת המרכז",
  description: "מערכת ניהול המרכז",
  appleWebApp: { capable: true, title: "SST", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#2F5D73",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} h-full antialiased`}>
      <body className="min-h-full bg-sand text-ink">{children}</body>
    </html>
  );
}
