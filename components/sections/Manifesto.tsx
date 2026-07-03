import { Container } from "@/components/ui/Container";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { KineticManifesto } from "@/components/KineticManifesto";
import { manifesto } from "@/lib/content/manifesto";

export function Manifesto() {
  // v7: светлый прибор, кинетика тушью по кости, пэйофф — signal-ink.
  return (
    <section
      id="manifesto"
      data-surface="light"
      aria-labelledby="manifesto-title"
      className="instrument py-[clamp(96px,14vw,180px)]"
    >
      <Container>
        <div className="mx-auto max-w-[64rem]">
          <MonoLabel tone="signal-ink">{manifesto.index}</MonoLabel>
          <span id="manifesto-title" className="sr-only">
            Манифест — {manifesto.payoff}
          </span>
          <KineticManifesto lines={[...manifesto.lines]} payoff={manifesto.payoff} />
        </div>
      </Container>
    </section>
  );
}
