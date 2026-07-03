import { contacts } from "@/lib/site";

export type ContactScene = "plane" | "envelope" | "concierge";

export const contact = {
  index: "04 — Контакт",
  titleLines: ["Хочу", "такой же"],
  lead: "Расскажите задачу — соберём систему под неё.",
  links: [
    {
      scene: "plane" as ContactScene,
      label: "Telegram",
      value: "@slklabs",
      href: contacts.telegram.href,
    },
    {
      scene: "envelope" as ContactScene,
      label: "Почта",
      value: contacts.email,
      href: `mailto:${contacts.email}`,
    },
    {
      scene: "concierge" as ContactScene,
      label: "Бриф",
      value: "Обсудить с консьержем",
      href: "#contact",
    },
  ],
  note: "SLK-labs — студия разработки и автоматизации.",
  year: "2026",
} as const;
