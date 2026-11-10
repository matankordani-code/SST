import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "SST™ · מערכת המרכז",
  description: "מערכת ניהול המרכז",
};

export const viewport: Viewport = {
  themeColor: "#1D6A80",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full bg-sand text-ink">{children}</body>
    </html>
  );
}
