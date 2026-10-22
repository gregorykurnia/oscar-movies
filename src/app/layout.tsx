import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AppShell } from "@/components/app-shell/AppShell";
import "./globals.css";

// Geist for every page (guide §4, §14). The variable goes on <html>; globals.css assigns it to --font-sans.
const geist = Geist({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "Oscar Movies",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        {/* Every page renders inside the shell (guide §6.1). Its season and watch-list captions arrive with the data (1.6, 1.8). */}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
