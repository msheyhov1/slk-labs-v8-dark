// Данные кейсов. Работа не описана — работа открыта: liveUrl встраивается
// в «окно ОС» (sandbox-iframe); embed:"video" — фоллбек записью экрана
// (Mini App / запрет встраивания через X-Frame-Options|CSP).
// ⚠️ Перед публичной витриной подтвердить публикуемость (крипто/AML, NDA).

export type CaseEmbed = "iframe" | "video" | "none";

export type CaseFact = { label: string; value: string };

export type Case = {
  slug: string;
  idx: string;
  title: string;
  type: string;
  year: string;
  stack: string;
  summary: string;
  embed: CaseEmbed;
  /** реальный URL проекта (iframe) либо страница «Открыть вживую» */
  liveUrl?: string;
  /** запись экрана ≤2МБ (muted loop) для embed:"video" */
  videoSrc?: string;
  videoPoster?: string;
  /** честный текст окна, пока живого контента нет (нет URL/видео) */
  windowNote?: string;
  facts: CaseFact[];
  /** живой виджет в карточке (rates — курс USDT/RUB для «Дозора») */
  widget?: "rates";
};

export const cases: Case[] = [
  {
    slug: "new-link-food",
    idx: "K-01",
    title: "New Link Food",
    type: "Сайт",
    year: "2025",
    stack: "web · 3d · i18n",
    summary: "Билингвальный продуктовый сайт с интерактивным 3D-глобусом и RFQ.",
    // ⏳ прод-URL проекта уточняется у владельца — живое окно оживёт одной строкой
    embed: "iframe",
    windowNote:
      "Сайт готовится к публикации — как только появится прод-URL, здесь откроется живое окно проекта.",
    facts: [
      { label: "Стек", value: "Next.js · three.js · i18n" },
      { label: "Срок", value: "6 недель" },
      { label: "Форма RFQ", value: "заявки напрямую в почту отдела" },
    ],
  },
  {
    slug: "smena",
    idx: "K-02",
    title: "Смена",
    type: "Telegram Mini App",
    year: "2025",
    stack: "telegram · fastapi · postgres",
    summary: "Сменное планирование как Telegram Mini App.",
    // Mini App не встраивается (Telegram) — фоллбек: запись экрана ≤2МБ.
    // ⏳ файл /cases/smena.mp4 добавляет владелец; до этого — честная заметка.
    embed: "video",
    liveUrl: "https://t.me/slklabs",
    windowNote:
      "Mini App живёт в Telegram — запись экрана добавляется. Открыть вживую можно кнопкой ниже.",
    facts: [
      { label: "Стек", value: "Mini App · FastAPI · PostgreSQL" },
      { label: "Смены", value: "планирование и учёт в один тап" },
      { label: "Уведомления", value: "бот сам напоминает о смене" },
    ],
  },
  {
    slug: "dozor",
    idx: "K-03",
    title: "Дозор",
    type: "Мониторинг",
    year: "2025",
    stack: "trc20 · aml",
    summary: "AML-мониторинг TRC20 и OTC-курсов в реальном времени.",
    embed: "none",
    windowNote:
      "Система приватная (AML) — публичного окна нет. Живой курс из неё — прямо в карточке кейса.",
    widget: "rates",
    facts: [
      { label: "Стек", value: "TRC20 · TronGrid · алерты" },
      { label: "Реакция", value: "транзакция → проверка → алерт" },
      { label: "Режим", value: "24/7 без дежурного" },
    ],
  },
];
