import { MonoLabel } from "@/components/ui/MonoLabel";
import { Reveal } from "@/components/Reveal";
import { ContactCard } from "@/components/contact/ContactCard";
import { contact } from "@/lib/content/contact";

export function Contact({ statusSlot }: { statusSlot?: React.ReactNode }) {
  // v7: светлый прибор-футер («Хочу такой же» без трения).
  return (
    <footer
      id="contact"
      data-surface="light"
      aria-labelledby="contact-title"
      className="instrument px-[var(--gutter)] py-[clamp(72px,10vw,128px)] pb-12"
    >
      <div className="mx-auto w-full max-w-[var(--container-max)]">
        <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-end gap-[clamp(40px,6vw,96px)] border-b border-hairline pb-16">
          <div>
            <MonoLabel tone="signal-ink">{contact.index}</MonoLabel>
            <h2
              id="contact-title"
              className="mt-5 text-[clamp(2.5rem,5.5vw,4.875rem)] font-normal leading-[1.02] tracking-poster text-[var(--color-bone-white)]"
            >
              {contact.titleLines[0]}
              <br />
              {contact.titleLines[1]}
            </h2>
            <p className="mt-6 max-w-[34ch] text-lead font-extralight leading-body text-[var(--color-silver)]">
              {contact.lead}
            </p>
          </div>

          <div className="flex flex-col gap-[14px]">
            {contact.links.map((l) => (
              <ContactCard key={l.label} link={l} />
            ))}
          </div>
        </Reveal>

        {/* Публичный статус реальных систем: «вот они, живые — проверьте» */}
        {statusSlot}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-7">
          <div className="flex items-center gap-[10px] font-mono text-[12px] tracking-[0.06em] text-[var(--color-ash)]">
            <span aria-hidden className="live-pulse h-2 w-2 rounded-full bg-[var(--color-iris)]" />
            <span>{contact.note}</span>
          </div>
          <span className="font-mono text-[12px] tracking-[0.06em] text-[var(--color-ash)]">
            © {contact.year}
          </span>
        </div>
      </div>
    </footer>
  );
}
