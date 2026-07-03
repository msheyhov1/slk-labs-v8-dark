// Единая конфигурация сайта: идентичность, навигация, контакты, SEO.
export const site = {
  name: "SLK-labs",
  // v8 живёт на Vercel (edge/realtime); линковку и домен делает владелец.
  // До прод-домена: превью-URL Vercel. Обновить одной строкой.
  url: "https://slk-labs-v8-dark.vercel.app",
  title: "SLK-labs — Процессы, которые живут без вас.",
  description: "Сайты. Боты. Автоматизация. Процессы, которые живут без вас.",
  payoff: "Студия разработки и автоматизации: сайты, боты, автоматизация.",
  locale: "ru_RU",
  themeColor: "#0E1114",
  keywords: ["разработка сайтов", "Telegram-боты", "автоматизация", "Next.js", "WebGL"],
} as const;

export const nav = [
  { href: "#works", label: "Работы" },
  { href: "#services", label: "Услуги" },
  { href: "#contact", label: "Контакт" },
] as const;

export const contacts = {
  email: "hello@slk-labs.studio",
  telegram: { label: "Telegram @slklabs", href: "https://t.me/slklabs" },
  location: "Remote · СНГ / EU",
} as const;
