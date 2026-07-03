"use client";

import { useState } from "react";
import { Reveal } from "@/components/Reveal";
import { CaseWindow } from "./CaseWindow";
import { RatesWidget } from "./RatesWidget";
import type { Case } from "@/lib/cases";

/**
 * Грид кейсов v7: тёмные стеклянные плитки (tile-ink) со штрихованной
 * превью-зоной; клик открывает «окно ОС» с живым проектом. У «Дозора»
 * в превью-зоне — настоящий живой курс вместо заглушки.
 */
export function WorksGrid({ cases }: { cases: Case[] }) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const open = cases.find((c) => c.slug === openSlug) ?? null;

  return (
    <>
      <Reveal
        stagger
        className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-px border border-[var(--color-hairline-on-ink-soft)] bg-[var(--color-hairline-on-ink-soft)]"
      >
        {cases.map((c) => (
          <article key={c.slug} data-reveal className="flex flex-col tile-ink">
            <button
              type="button"
              onClick={() => setOpenSlug(c.slug)}
              aria-haspopup="dialog"
              aria-label={`Открыть кейс ${c.title} в живом окне`}
              className="group flex flex-1 cursor-pointer flex-col text-left transition-transform duration-[var(--dur-short)] ease-[var(--ease-ink)] will-change-transform hover:-translate-y-[3px] active:-translate-y-[1px]"
            >
              {/* превью-зона: штриховка v7; у «Дозора» — живой курс */}
              <div className="diagonal-hatch relative flex aspect-[16/10] flex-col justify-end overflow-hidden p-[18px]">
                <span className="absolute left-[18px] top-[18px] font-mono text-[12px] tracking-[0.06em] text-signal">
                  {c.idx}
                </span>
                {c.widget === "rates" ? (
                  <RatesWidget />
                ) : (
                  <span
                    aria-hidden
                    className="font-mono text-[11px] uppercase tracking-label text-[var(--color-ink-fg-4)]"
                  >
                    [ живое окно — клик ]
                  </span>
                )}
              </div>

              <div className="px-[clamp(20px,2.4vw,28px)] pb-7 pt-6">
                <h3 className="m-0 text-[1.5rem] font-semibold tracking-tight text-[var(--color-ink-fg)]">
                  {c.title}
                </h3>
                <p className="mt-3 max-w-[40ch] text-small leading-body text-[var(--color-ink-fg-3)]">
                  {c.summary}
                </p>
                <div className="mt-[18px] flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-hairline-on-ink-soft)] pt-4 font-mono text-[12px] uppercase tracking-[0.06em]">
                  <span className="flex flex-wrap gap-[18px] text-[var(--color-ink-fg-3)]">
                    <span>{c.type}</span>
                    <span>{c.year}</span>
                    <span className="text-signal">{c.stack}</span>
                  </span>
                  <span className="text-[var(--color-ink-fg-3)] transition-transform duration-[var(--dur-micro)] group-hover:translate-x-[3px]">
                    {c.embed === "none" ? "детали →" : "окно →"}
                  </span>
                </div>
              </div>
            </button>
          </article>
        ))}
      </Reveal>

      {open && <CaseWindow c={open} onClose={() => setOpenSlug(null)} />}
    </>
  );
}
