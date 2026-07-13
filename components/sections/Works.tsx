import { Container } from "@/components/ui/Container";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { WorksGrid } from "@/components/cases/WorksGrid";
import { cases } from "@/lib/cases";

export function Works() {
  // v7: тёмная сцена — сеть за карточками, стеклянные tile-ink плитки.
  return (
    <section
      id="works"
      data-surface="dark"
      aria-labelledby="works-title"
      className="py-[clamp(72px,10vw,128px)] text-[var(--color-ink-fg)]"
    >
      <Container>
        <div className="mb-4 flex items-end justify-between gap-6">
          <div>
            <MonoLabel tone="signal">01 — Работы</MonoLabel>
            <h2
              id="works-title"
              className="mt-5 max-w-[16ch] text-display font-normal leading-[var(--leading-tight)] tracking-poster"
            >
              Запущенные системы
            </h2>
            <p className="mt-6 max-w-[44ch] text-lead font-extralight text-[var(--color-silver)]">
              Работа не описана — работа открыта. Кейсы живые: скролльте и кликайте прямо в окне.
            </p>
          </div>
          <MonoLabel tone="fg" className="mb-2 hidden shrink-0 sm:block">
            2024 — 2025 / {String(cases.length).padStart(2, "0")} записи
          </MonoLabel>
        </div>

        <WorksGrid cases={cases} />
      </Container>
    </section>
  );
}
