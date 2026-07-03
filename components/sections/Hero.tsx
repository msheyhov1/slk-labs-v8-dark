import { Container } from "@/components/ui/Container";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { LivingField } from "@/components/system/LivingField";
import { LiveBadge } from "@/components/system/LiveBadge";
import { hero } from "@/lib/content/hero";

export function Hero() {
  // v7: герой прозрачен над тёмным живым полем; текст светлый (ink-fg).
  return (
    <section
      id="top"
      data-surface="dark"
      aria-label="SLK-labs — студия разработки и автоматизации"
      className="relative flex min-h-[100svh] items-center overflow-hidden text-[var(--color-ink-fg)]"
    >
      {/* тихое зелёное свечение поля (v7) — вместо солнца Ink·Dawn */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 70% 30%, rgb(var(--color-signal-rgb) / 0.06), transparent 60%)",
        }}
      />

      {/* Живая система: сеть связей, собирающая энсо (WebGL2) */}
      <LivingField />

      <Container className="relative z-[2] py-[120px] pt-[136px]">
        <div className="mb-12 flex items-center justify-between gap-6 border-b border-[var(--color-hairline-on-ink)] pb-7">
          <MonoLabel tone="fg">{hero.eyebrow}</MonoLabel>
          <LiveBadge />
        </div>

        {/* Вордмарк v7: SLK гротеск + -labs моно зелёный */}
        <h1 className="m-0 flex items-end leading-[var(--leading-poster)] tracking-poster">
          <span className="font-semibold text-poster">SLK</span>
          <span className="ml-[0.04em] pb-[0.12em] font-mono text-signal text-[clamp(1.1rem,3.6vw,3rem)] tracking-tight">
            -labs
          </span>
        </h1>

        <p className="mt-10 max-w-[40rem] text-[clamp(1.3rem,2.4vw,2.1rem)] font-medium leading-tight tracking-tight text-[var(--color-ink-fg-2)]">
          {hero.payoff}
        </p>

        {/* подпись к оттиску — появляется после сборки энсо */}
        <p
          data-enso-note
          className="mt-6 max-w-[36ch] font-mono text-[12px] leading-[var(--leading-mono)] tracking-[0.04em] text-[var(--color-ink-fg-3)] opacity-0 transition-opacity duration-[var(--dur-base)]"
        >
          {hero.ensoNote}
        </p>

        {/* стат-плитки v7 */}
        <dl className="mt-16 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-px border border-[var(--color-hairline-on-ink-soft)] bg-[var(--color-hairline-on-ink-soft)]">
          {hero.specs.map((s) => (
            <div key={s.label} className="m-0 bg-ink px-[18px] py-4">
              <dt className="font-mono text-[11px] uppercase tracking-label text-[var(--color-ink-fg-3)]">
                {s.label}
              </dt>
              <dd
                className={`m-0 mt-[6px] font-mono text-[14px] ${
                  "signal" in s && s.signal ? "text-signal" : "text-[var(--color-ink-fg)]"
                }`}
              >
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </Container>

      <span className="absolute bottom-7 left-[var(--gutter)] z-[2] font-mono text-[12px] uppercase tracking-label text-[var(--color-ink-fg-3)]">
        {hero.scrollCue}
      </span>
    </section>
  );
}
