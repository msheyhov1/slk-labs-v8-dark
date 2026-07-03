# SLK-labs — Дизайн-токены v2 · направление B «Тушь · Рассвет»

> Полный пересбор после редизайна. v1 (костяной-холодный + зелёный + сеть-созвездие) **списан**.
> Концепция B: **рассвет = свет, что приходит сам, без тебя**; **красный энсо = знак, нарисованный
> одним штрихом и работающий вечно** — буквальный образ пэйоффа «Процессы, которые живут без вас».
> Значения — стартовые: точные hex и шрифты финально запираются в Claude Design, затем → `tokens.css`.
>
> Вербальная идентичность не меняется: имя **SLK-labs**, пэйофф «Процессы, которые живут без вас», манифест.

---

## 1. Контраст-отчёт (проверено)

Палитра читаемая целиком — в отличие от зелёного из v1. Правило-наследник: **яркий красный = только
диск солнца и крупная графика; глубокий красный = текст, знаки, марки.**

| Пара | Применение | Контраст | WCAG |
|---|---|---|---|
| `ink #16130D` на `paper #ECE5D6` | основной текст | **14.8:1** | AAA |
| `graphite #6B6456` на `paper` | вторичный текст | **4.7:1** | AA |
| `red-deep #BE2A24` на `paper` | красный текст / знаки на светлом | **4.7:1** | AA |
| `red-bright #E0382B` на `paper` | ✗ текст / ✓ диск солнца, крупная графика | **3.5:1** | только большой/графика |
| `paper #ECE5D6` на `red-deep` (кнопка-ханко) | текст на красной кнопке | **4.7:1** | AA |
| `ink` на `red-deep` | ✗ мелкий текст на красном | **3.1:1** | только большой/графика |
| `paper` на `ink` (инверсная секция) | текст на тёмном | **14.8:1** | AAA |
| `hairline #D6CBB4` на `paper` | декоративные линии | ~1.3:1 | только декор |

Выводы: текст на красной кнопке — бумагой, не чёрным (чёрный на красном всего 3.1:1). Яркий красный
никогда не несёт текст — только солнце и крупные пятна. Инверсные тёмные секции работают (бумага по чёрному 14.8:1).

---

## 2. Цвет

| Токен | Hex | Роль |
|---|---|---|
| `--color-paper` | `#ECE5D6` | основная тёплая бумага (теплее холодной кости v1) |
| `--color-paper-sunken` | `#E4DBC8` | глубже на тон — панели, оттиски |
| `--color-ink` | `#16130D` | тёплый почти-чёрный: текст и тёмная поверхность |
| `--color-graphite` | `#6B6456` | вторичный текст, подписи |
| `--color-hairline` | `#D6CBB4` | декоративные линии (низкий контраст намеренно) |
| `--color-red-deep` | `#BE2A24` | **акцент-знак**: энсо, марки, красный текст, кнопка-ханко (сургуч/печать) |
| `--color-red-bright` | `#E0382B` | **только** диск восходящего солнца и крупная графика; НЕ текст |
| `--color-red-press` | `#A32119` | hover/pressed для красного |

Правило применения: монохром тушь-по-бумаге держит сайт; красный — один знак (энсо), приходит как печать.
Смысловой красный текст — только `red-deep`. НЕ алый, НЕ терракота — глубокий печатный красный.

---

## 3. Типографика

**Роли** (финальные шрифты — в Claude Design):
- `--font-display` — **тяжёлый характерный гротеск** (постерные высказывания, архитектура веса).
- `--font-mono` — **издательский моноширинный** (индекс, каптионы, печать на полях — не «терминал»).
- Тело — гротеск в regular; вторую семью не плодим (дисциплина).

**Стартовые кандидаты для проб:** display — Archivo / Archivo Expanded (variable: вес + ширина) или Anton
(ультра-тяжёлый, только для героя); mono — Space Mono (характер, «печать») или IBM Plex Mono.

**Шкала (fluid `clamp`, постерный размах):**

| Токен | Значение | ~px (min→max) |
|---|---|---|
| `--text-poster` | `clamp(3.5rem, 11vw, 12rem)` | 56 → 192 (герой) |
| `--text-display` | `clamp(2.75rem, 7vw, 6.5rem)` | 44 → 104 |
| `--text-h1` | `clamp(2rem, 4.5vw, 4rem)` | 32 → 64 |
| `--text-h2` | `clamp(1.6rem, 3vw, 2.5rem)` | 26 → 40 |
| `--text-h3` | `clamp(1.25rem, 2vw, 1.75rem)` | 20 → 28 |
| `--text-lead` | `clamp(1.15rem, 1.6vw, 1.4rem)` | 18 → 22 |
| `--text-body` | `1.0625rem` | 17 |
| `--text-small` | `0.9375rem` | 15 |
| `--text-label` | `0.8125rem` | 13 (моно, uppercase, индекс/печать) |

**Высота строки / трекинг / вес:**
`--leading-poster: 0.96` · `--leading-tight: 1.08` · `--leading-body: 1.6` · `--leading-mono: 1.45`
`--tracking-poster: -0.03em` (плотный постерный) · `--tracking-tight: -0.01em` · `--tracking-label: 0.1em` (моно-печать)
`--weight-regular: 400` · `--weight-medium: 500` · `--weight-heavy: 800` (постерный display)

---

## 4. Отступы, сетка, радиусы — японский воздух (ma)

**Шкала отступов (база 4px):**
`--space-1: 4` · `2: 8` · `3: 12` · `4: 16` · `6: 24` · `8: 32` · `12: 48` · `16: 64` · `24: 96` · `32: 128` · `40: 160` · `48: 192` · `64: 256`

Ритм секций намеренно крупнее v1 — воздух как часть композиции. Между блоками — `--space-40/48/64`.

**Лейаут:**
`--container-max: 90rem` (1440) · `--container-text: 36rem` (≈576) · `--gutter: clamp(1.5rem, 5vw, 5rem)` ·
сетка 12 кол. с **уверенной асимметрией** (контент смещён, широкие поля — не центрированная безопасность).

**Радиусы** (редакторская резкость — углы острые; единственная кривая в системе это энсо/круг):
`--radius-none: 0` · `--radius-sm: 2px` · `--hairline: 1px`

---

## 5. Моушн — тушь по бумаге + штамп

Принцип: один удар (восход + штрих) на загрузке, дальше дисциплина. Ревилы приходят как касание туши к
бумаге (быстрый bleed, не дефолтный fade). `prefers-reduced-motion` → солнце уже взошло, всё статично, но собрано.

**Длительности:**
`--dur-micro: 0.15s` · `--dur-short: 0.3s` · `--dur-base: 0.6s` (чернильный ревил) ·
`--dur-slow: 0.9s` · `--dur-hero: 1.4s` (восход солнца + отрисовка энсо) · `--stagger: 0.07s`

**Easing (CSS ↔ GSAP):**

| Токен | cubic-bezier | GSAP | Назначение |
|---|---|---|---|
| `--ease-ink` | `0.16, 1, 0.3, 1` | `expo.out` | **сигнатурный**: тушь оседает в бумагу (ревилы, сборка) |
| `--ease-stamp` | `0.34, 1.56, 0.64, 1` | `back.out(1.7)` | штамп-ханко: кнопка/знак «впечатывается» с лёгким овершутом |
| `--ease-scene` | `0.83, 0, 0.17, 1` | `power4.inOut` | переходы разделов/страниц |
| `--ease-standard` | `0.4, 0, 0.2, 1` | `power1.inOut` | служебное |

**Сигнатурные моменты:**
- *Герой:* солнце восходит (translateY снизу) + энсо дорисовывается одним штрихом (SVG `stroke-dashoffset`, либо GSAP DrawSVG). Медленно, `--dur-hero`, `--ease-ink`.
- *CTA «Хочу такой же»:* кнопка-ханко штампуется — `--ease-stamp`, короткий scale-overshoot, как печать по бумаге.
- *Кейсы/панели:* въезжают по косой геометрии (картинки-референсы 5, 16), `--ease-ink`.

---

## 6. `tokens.css` — единый источник правды

```css
:root {
  /* — Color — */
  --color-paper: #ECE5D6;
  --color-paper-sunken: #E4DBC8;
  --color-ink: #16130D;
  --color-graphite: #6B6456;
  --color-hairline: #D6CBB4;
  --color-red-deep: #BE2A24;     /* энсо, знаки, красный текст, кнопка */
  --color-red-bright: #E0382B;   /* ТОЛЬКО диск солнца / крупная графика */
  --color-red-press: #A32119;

  /* — Type — */
  --font-display: "Archivo", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Space Mono", ui-monospace, "SF Mono", monospace;
  --text-poster: clamp(3.5rem, 11vw, 12rem);
  --text-display: clamp(2.75rem, 7vw, 6.5rem);
  --text-h1: clamp(2rem, 4.5vw, 4rem);
  --text-h2: clamp(1.6rem, 3vw, 2.5rem);
  --text-h3: clamp(1.25rem, 2vw, 1.75rem);
  --text-lead: clamp(1.15rem, 1.6vw, 1.4rem);
  --text-body: 1.0625rem;
  --text-small: 0.9375rem;
  --text-label: 0.8125rem;
  --leading-poster: 0.96;
  --leading-tight: 1.08;
  --leading-body: 1.6;
  --leading-mono: 1.45;
  --tracking-poster: -0.03em;
  --tracking-tight: -0.01em;
  --tracking-label: 0.1em;
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-heavy: 800;

  /* — Space / layout — */
  --space-1: 0.25rem;  --space-2: 0.5rem;  --space-3: 0.75rem; --space-4: 1rem;
  --space-6: 1.5rem;   --space-8: 2rem;    --space-12: 3rem;   --space-16: 4rem;
  --space-24: 6rem;    --space-32: 8rem;   --space-40: 10rem;  --space-48: 12rem; --space-64: 16rem;
  --container-max: 90rem;
  --container-text: 36rem;
  --gutter: clamp(1.5rem, 5vw, 5rem);

  /* — Radius / line — */
  --radius-none: 0; --radius-sm: 2px; --hairline: 1px;

  /* — Motion — */
  --dur-micro: 0.15s; --dur-short: 0.3s; --dur-base: 0.6s;
  --dur-slow: 0.9s;   --dur-hero: 1.4s;  --stagger: 0.07s;
  --ease-ink: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-stamp: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-scene: cubic-bezier(0.83, 0, 0.17, 1);
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  /* солнце статично «уже взошло», энсо отрисован — JS проверяет тот же media-query */
}
```

---

## 7. Tailwind v4 — `@theme`

```css
@import "tailwindcss";

@theme {
  --color-paper: #ECE5D6;
  --color-paper-sunken: #E4DBC8;
  --color-ink: #16130D;
  --color-graphite: #6B6456;
  --color-hairline: #D6CBB4;
  --color-red-deep: #BE2A24;
  --color-red-bright: #E0382B;
  --color-red-press: #A32119;

  --font-display: "Archivo", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Space Mono", ui-monospace, monospace;

  --text-poster: clamp(3.5rem, 11vw, 12rem);
  --text-display: clamp(2.75rem, 7vw, 6.5rem);
  --text-h1: clamp(2rem, 4.5vw, 4rem);
  --text-h2: clamp(1.6rem, 3vw, 2.5rem);
  --text-h3: clamp(1.25rem, 2vw, 1.75rem);
  --text-lead: clamp(1.15rem, 1.6vw, 1.4rem);

  --tracking-poster: -0.03em;
  --tracking-label: 0.1em;

  --spacing: 0.25rem;        /* числовая шкала p-1=4px … генерится отсюда */

  --radius-sm: 2px;

  --ease-ink: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-stamp: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-scene: cubic-bezier(0.83, 0, 0.17, 1);
}
```
*(Tailwind v3 — те же значения в `theme.extend`.)*

---

## 8. GSAP — карта моушна (`lib/motion.ts`)

```ts
export const motion = {
  dur:     { micro: 0.15, short: 0.3, base: 0.6, slow: 0.9, hero: 1.4 },
  stagger: 0.07,
  ease:    { ink: "expo.out", stamp: "back.out(1.7)", scene: "power4.inOut", standard: "power1.inOut" },
} as const;

// Герой: восход + отрисовка энсо
// gsap.timeline()
//   .from(".sun", { yPercent: 60, opacity: 0, duration: motion.dur.hero, ease: motion.ease.ink })
//   .from(".enso", { drawSVG: 0, duration: motion.dur.hero, ease: motion.ease.ink }, "<");
//   (без плагина DrawSVG — анимировать stroke-dashoffset)

// Чернильный ревил: gsap.from(".reveal", { autoAlpha: 0, y: 20, duration: motion.dur.base,
//   ease: motion.ease.ink, stagger: motion.stagger });

// Штамп-ханко (CTA): gsap.from(".stamp", { scale: 1.25, opacity: 0,
//   duration: motion.dur.short, ease: motion.ease.stamp });
```

---

## Что изменилось против v1 (и почему)

- **Фон:** холодная кость `#F2F0E9` → тёплая бумага `#ECE5D6` (зерно, тушь — а не «чистый таб»).
- **Акцент:** сигнальный зелёный → печатный красный-энсо. Причина: зелёный = generic dev-клише и не из твоего вайба; красный = знак с тезисом, читаемый текстом.
- **Сигнатура:** сеть-созвездие (анти-референс) → восход + энсо одним штрихом (= пэйофф буквально).
- **Тип:** нейтральный гротеск → тяжёлый постерный + издательский моно (печать на полях).
- **Композиция:** аккуратная сетка → японский воздух (ma) и уверенная асимметрия.
- **Моторика:** «фейды» → тушь по бумаге + штамп.

## Как использовать
1. В Claude Design запереть: точную бумагу, точный красный (старт `#BE2A24`), пару шрифтов → подставить сюда.
2. `tokens.css` — единственный источник правды; Tailwind `@theme` и `lib/motion.ts` ссылаются на те же значения.
3. Контраст-правило из §1 — закон: яркий красный только солнце/графика; текст на красной кнопке — бумагой.
