import { Container } from "@/components/ui/Container";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { LivingField } from "@/components/system/LivingField";
import { LiveBadge } from "@/components/system/LiveBadge";
import { hero } from "@/lib/content/hero";

export function Hero() {
  // Dala: герой плывёт на чистом void. Огромный вордмарк весом 400,
  // янтарный ярлык-эмфаза, ультралайт-пэйофф, одна фиолетовая пилюля-действие.
  // Поле-констелляция (WebGL) — фирменный жест бренда за текстом.
  return (
    <section
      id="top"
      data-surface="dark"
      aria-label="SLK-labs — студия разработки и автоматизации"
      className="relative flex min-h-[100svh] items-center overflow-hidden text-[var(--color-bone-white)]"
    >
      {/* Нейро-мозг Dala: облако частиц-огоньков + синапсы (WebGL2).
          Канвас непрозрачный (чёрный + аддитивный свет) — свечение кладём ПОВЕРХ. */}
      <LivingField />

      {/* тихий фиолетово-синий ореол за мозгом (спектр Dala) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 70% at 72% 46%, rgba(128,82,255,0.09), rgba(79,141,255,0.04) 45%, transparent 68%)",
        }}
      />

      <Container className="relative z-[2] py-[120px] pt-[136px]">
        <div className="mb-12 flex items-center justify-between gap-6">
          <MonoLabel tone="signal">{hero.eyebrow}</MonoLabel>
          <LiveBadge />
        </div>

        {/* Вордмарк Dala: SLK белый вес 400 + -labs фиолетовый (бренд-акцент) */}
        <h1 className="m-0 flex items-end font-normal leading-[var(--leading-poster)] tracking-poster">
          <span className="text-poster">SLK</span>
          <span className="ml-[0.03em] pb-[0.14em] text-[var(--color-iris)] text-[clamp(1.4rem,4vw,3.4rem)] tracking-tight">
            -labs
          </span>
        </h1>

        <p className="mt-9 max-w-[38rem] text-[clamp(1.35rem,2.6vw,2.25rem)] font-extralight leading-[1.12] tracking-tight text-[var(--color-bone-white)]">
          {hero.payoff}
        </p>

        {/* Единственная заливка-действие в Dala — фиолетовая пилюля */}
        <div className="mt-11 flex flex-wrap items-center gap-x-8 gap-y-4">
          <a
            href="#contact"
            className="hanko inline-flex items-center gap-2 px-7 py-[14px] text-label font-semibold uppercase tracking-label no-underline"
          >
            Обсудить проект
          </a>
          <a
            href="#works"
            className="text-label font-medium uppercase tracking-label text-[var(--color-ash)] no-underline transition-colors duration-[var(--dur-micro)] hover:text-[var(--color-bone-white)]"
          >
            Смотреть работы →
          </a>
        </div>

        {/* Стат-строка Dala: без карточек и рамок — плывёт на void */}
        <dl className="mt-16 flex flex-wrap gap-x-14 gap-y-8">
          {hero.specs.map((s) => (
            <div key={s.label} className="m-0">
              <dt className="text-[12px] font-semibold uppercase tracking-label text-[var(--color-saffron)]">
                {s.label}
              </dt>
              <dd
                className={`m-0 mt-2 text-[15px] font-normal ${
                  "signal" in s && s.signal
                    ? "text-[var(--color-iris)]"
                    : "text-[var(--color-bone-white)]"
                }`}
              >
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </Container>

      <span className="absolute bottom-7 left-[var(--gutter)] z-[2] text-[12px] font-semibold uppercase tracking-label text-[var(--color-ash)]">
        {hero.scrollCue}
      </span>
    </section>
  );
}
