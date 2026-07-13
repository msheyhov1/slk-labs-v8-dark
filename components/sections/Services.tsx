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
          className="mt-5 max-w-[18ch] text-display font-normal leading-[var(--leading-tight)] tracking-poster text-[var(--color-bone-white)]"
        >
          {servicesIntro.title}
        </h2>

        <Reveal
          stagger
          className="mt-16 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-x-14 gap-y-[clamp(40px,6vw,72px)]"
        >
          {services.map((s) => (
            <article
              key={s.n}
              data-reveal
              className="flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-[var(--color-iris)]" />
                <span className="font-mono text-[13px] tracking-[0.06em] text-[var(--color-ash)]">{s.n}</span>
              </div>
              <h3 className="m-0 text-h3 font-normal leading-[1.15] tracking-tight text-[var(--color-bone-white)]">
                {s.title}
              </h3>
              <p className="m-0 flex-1 text-body font-extralight leading-body text-[var(--color-silver)]">{s.desc}</p>
              <div className="pt-1 text-[12px] font-semibold uppercase tracking-label text-[var(--color-saffron)]">
                {s.tag}
              </div>
            </article>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
