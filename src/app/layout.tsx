import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getLocale, dirFor } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { SiteHeader } from "@/components/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BNOW.NET — validated OSINT intelligence",
  description: "Transparent source reliability ratings for conflict-zone OSINT, validated daily against expert analysis.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const t = makeT(locale);
  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:border-slate-300 focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 dark:focus:border-slate-700 dark:focus:bg-slate-900 dark:focus:text-white dark:focus:outline-blue-400"
        >
          {t("common.skip_to_content")}
        </a>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
