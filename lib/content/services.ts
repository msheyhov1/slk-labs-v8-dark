export const servicesIntro = {
  index: "02 — Услуги",
  title: "Что собираем",
} as const;

export const services = [
  {
    n: "01",
    title: "Сайты",
    desc: "Премиальные интерфейсы, которые сами доказывают уровень.",
    tag: "web · webgl · motion",
  },
  {
    n: "02",
    title: "Боты",
    desc: "Telegram-системы и Mini Apps — приём, учёт, уведомления.",
    tag: "telegram · api · mini apps",
  },
  {
    n: "03",
    title: "Автоматизация",
    desc: "Процессы, которые работают без ручного участия.",
    tag: "pipelines · мониторинг · интеграции",
  },
] as const;
