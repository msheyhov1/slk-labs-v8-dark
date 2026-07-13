import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
import { Header } from "@/components/Header";
import { SystemLayer } from "@/components/system/SystemLayer";
import { site, contacts } from "@/lib/site";

// Dala: единый гротеск во всех контекстах. PPNeueMontreal запирается в
// Claude Design — субститут Inter (с кириллицей). Вес 200 (ультралайт тело) —
// фирменная черта; 400 — регуляр заголовков (иерархия масштабом, не весом).
// Моно (Geist_Mono, с кириллицей) остаётся ТОЛЬКО для терминала/HUD/boot.
const display = Inter({
  variable: "--font-v8-display",
  subsets: ["latin", "cyrillic"],
  weight: ["200", "400", "500", "600", "700"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-v8-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.title,
  description: site.description,
  keywords: [...site.keywords],
  alternates: { canonical: `${site.url}/` },
  openGraph: {
    type: "website",
    locale: site.locale,
    url: `${site.url}/`,
    siteName: site.name,
    title: site.title,
    description: site.payoff,
    images: [{ url: `${site.url}/og.png`, width: 1200, height: 630, alt: site.title }],
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.payoff,
    images: [`${site.url}/og.png`],
  },
};

export const viewport: Viewport = { themeColor: site.themeColor };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ru"
      className={`${display.variable} ${mono.variable} antialiased`}
      // .js / data-booted ставятся pre-paint скриптом ниже — React их не сверяет
      suppressHydrationWarning
    >
      <body>
        {/* до paint: .js включает reveal/boot-грамматику (no-JS остаётся видимым),
            повторный заход в сессии гасит boot-оверлей без вспышки */}
        <Script
          id="slk-pre-paint"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add("js");try{if(sessionStorage.getItem("slk-booted"))document.documentElement.dataset.booted="1"}catch(e){}`,
          }}
        />
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-[var(--color-iris)] focus:px-5 focus:py-3 focus:text-label focus:font-medium focus:text-[var(--color-bone-white)]"
        >
          Перейти к содержанию
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ProfessionalService",
              name: site.name,
              url: `${site.url}/`,
              description: site.description,
              email: contacts.email,
              sameAs: [contacts.telegram.href],
            }),
          }}
        />
        <Header />
        <SmoothScroll>{children}</SmoothScroll>
        {/* Приборный слой: boot-sequence, HUD, палитра/терминал, presence */}
        <SystemLayer />
      </body>
    </html>
  );
}
