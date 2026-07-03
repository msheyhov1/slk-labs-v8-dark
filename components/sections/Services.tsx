import { Container } from "@/components/ui/Container";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Reveal } from "@/components/Reveal";
import { services, servicesIntro } from "@/lib/content/services";

export function Services() {
  // v7: светлый «прибор» над живым полем; мост смягчает стык с тёмной сценой.
  return (
    <section
      id="services"
      data-surface="light"
      aria-labelledby="services-title"
      className="instrument instrument-bridge py-[clamp(72px,10vw,128px)]"
    >
      <Container>
        <MonoLabel tone="signal-ink">{servicesIntro.index}</MonoLabel>
        <h2
          id="services-title"
          className="mt-4 text-display font-semibold leading-[var(--leading-tight)] tracking-poster text-ink"
        >
          {servicesIntro.title}
        </h2>

        <Reveal
          stagger
          className="mt-14 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-px border border-hairline bg-hairline"
        >
          {services.map((s) => (
            <article
              key={s.n}
              data-reveal
              className="tile-bone flex flex-col gap-4 p-[clamp(28px,3vw,40px)]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[13px] tracking-[0.06em] text-ink-2">{s.n}</span>
                <span aria-hidden className="h-[7px] w-[7px] rounded-[1px] bg-signal-ink" />
              </div>
              <h3 className="m-0 text-h3 font-semibold leading-[1.15] tracking-tight text-ink">
                {s.title}
              </h3>
              <p className="m-0 flex-1 text-body leading-body text-ink-2">{s.desc}</p>
              <div className="border-t border-hairline pt-4 font-mono text-[12px] uppercase tracking-[0.06em] text-signal-ink">
                {s.tag}
              </div>
            </article>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
