# CLAUDE.md — SLK-labs v8-dark «Living System · скин v7»

> ВАРИАНТ: те же фичи, что slk-labs-v8 (Ink·Dawn), но дизайн v7 —
> тёмное живое поле + костяная база + сигнальный зелёный + Geist.
> Меняя фичи — синхронизируй с ../slk-labs-v8 (и наоборот).

> Сайт-доказательство: не рассказывает про живые системы — ЯВЛЯЕТСЯ живой системой.
> Каждая wow-фича настоящая: реальные данные, реальный realtime, реальные метрики.
> **Никаких фейков** — техническая аудитория чует муляж мгновенно.
> Полная спека: `docs/SPEC-v8-living-system.md`. Дизайн: `docs/SLK-labs_Design_Tokens_v2.md`
> (направление B «Тушь · Рассвет»: тёплая бумага + тушь + печатный красный + энсо).

## Стек

- **Next.js 16** (App Router) + TypeScript strict + Tailwind v4 (`styles/tokens.css` — единственная правда).
- **WebGL2 без three** — живое поле (сеть → энсо) в `components/system/engine/field.ts`.
- **GSAP + Lenis** — «полёт» и чернильные ревилы. SplitType не используется.
- **PartyKit** (`party/` + `partykit.json`, вне tsconfig) — presence; деплой отдельно.
- Хостинг: **Vercel** (route handlers нужны серверные). Линковку делает владелец.

## Шрифты (осознанная замена)

Archivo / Space Mono из токен-дока **не имеют кириллицы** → рабочая пара
**Inter Tight** (постер, 800) + **IBM Plex Mono** (издательский моно). Финальная
пара запирается в Claude Design — замена в `app/layout.tsx` одной строкой.

## Контраст-закон (из Design Tokens v2 §1 — НЕ нарушать)

- `red-bright #E0382B` — только диск солнца / крупная графика, НЕ мелкий текст
  (на туши манифеста в постерном размере — допустимо: 3.8:1 ≥ 3:1 large-AA);
- красный текст/знаки на бумаге — `red-deep #BE2A24` (4.7:1);
- текст на красной кнопке-ханко — бумагой (4.7:1), не чёрным (3.1:1);
- hairline — только декор.

## Карта: где что живёт

| Что | Файл |
|---|---|
| Живое поле (сеть+энсо, WebGL2) | `components/system/engine/field.ts` + `LivingField.tsx` |
| Boot-sequence (реальный лог) | `components/system/Boot.tsx` + pre-paint скрипт в `app/layout.tsx` |
| HUD телеметрии | `components/hud/Hud.tsx` + `lib/telemetry.ts` |
| Палитра Cmd+K + терминал | `components/palette/` (`terminal.ts` — команды) |
| Окна ОС кейсов | `components/cases/` (данные: `lib/cases.ts`) |
| Живой курс «Дозора» | `components/cases/RatesWidget.tsx` ← `/api/rates` (Binance, кэш 60с) |
| Контакт-сцены (самолётик/конверт/консьерж) | `components/contact/` |
| Публичный статус систем | `components/status/StatusLine.tsx` ← `/api/status` (env `STATUS_TARGETS`) |
| AI-консьерж | `/api/concierge` (Claude, ключ серверный) + `components/contact/Concierge.tsx` |
| Presence (PartyKit) | `party/index.ts`, клиент `components/presence/`, стор `lib/presence-store.ts` |
| Перелёты (палитра/якоря) | `lib/scroll-store.ts::flyTo` (Lenis) |
| Seed оттиска | `lib/seed.ts` (время+viewport+GPU, локальный хеш — не трекинг) |

## Инварианты

- **Прогрессивность:** без ENV (см. `.env.example`) всё работает, реалтайм-блоки честно молчат.
- **reduced-motion:** boot выключен, энсо статичен сразу, Lenis off, сцены контактов → мгновенное действие.
- **Перф:** собственный аккумулятор времени в движке (не wall-clock), пауза на hidden/blur/вне вьюпорта,
  авто-даунгрейд по FPS-замеру; тяжёлое — лениво (`SystemLayer` → dynamic ssr:false).
- Якоря `#works #services #contact` — не ломать (совместимость с v7).
- `<main id="content">` в page.tsx; Contact (`<footer>`) — вне main (contentinfo).
- Терминал/статусы отвечают реальными данными; `enso --reseed` реально пересобирает штрих.

## Команды

```bash
npm run dev                      # localhost:3000
npm run build && npm run start   # прод локально
npx eslint app components lib    # линт
npx partykit deploy              # presence (владелец; хост → NEXT_PUBLIC_PARTYKIT_HOST)
```

## Статус (2026-07-03)

Реализовано: каркас Ink·Dawn, живое поле (сеть→энсо, boot, seed, reseed),
полёт (Lenis+ревилы+кинетический манифест), окна ОС кейсов (драг/максимайз/
sandbox-iframe/фоллбеки), HUD, палитра+терминал, контакт-сцены, консьерж,
/api/{status,rates,concierge}, PartyKit-заготовка, OG/иконки.

Ждёт владельца: прод-URL New Link Food (→ живой iframe), запись экрана «Смены»
(`public/cases/smena.mp4`), деплой Vercel + PartyKit + env, финальная пара
шрифтов из Claude Design. Срезано осознанно: «линии тянут заголовки» (v8.1),
шейдер «тушь в воде» (Tier 3), View Transitions (Tier 3).
