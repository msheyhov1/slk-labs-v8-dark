"use client";

import { useEffect, useRef } from "react";
import { gsap, prefersReduced } from "@/lib/gsap";
import { motion } from "@/lib/motion";

/**
 * Кинетический манифест (v7-поверхность: тушь по кости): строки на скорости
 * с резкой остановкой. Ключевые строки — ink, остальные — ink-2, пэйофф
 * впечатывается signal-ink (читаемый зелёный на светлом).
 *
 * A11y: sr-only копия целого текста; кинетический слой aria-hidden.
 */
export function KineticManifesto({
  lines,
  payoff,
}: {
  lines: string[];
  payoff: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced()) return;

    const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-line]"));
    const stamp = el.querySelector<HTMLElement>("[data-payoff]");

    const ctx = gsap.context(() => {
      rows.forEach((row) => {
        gsap.fromTo(
          row,
          { autoAlpha: 0, x: 56, skewX: -6 },
          {
            autoAlpha: 1,
            x: 0,
            skewX: 0,
            duration: motion.dur.base,
            ease: motion.ease.ink,
            scrollTrigger: { trigger: row, start: "top 86%", once: true },
          },
        );
      });
      if (stamp) {
        gsap.fromTo(
          stamp,
          { autoAlpha: 0, scale: 1.22 },
          {
            autoAlpha: 1,
            scale: 1,
            duration: motion.dur.short,
            ease: motion.ease.stamp,
            scrollTrigger: { trigger: stamp, start: "top 88%", once: true },
          },
        );
      }
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className="mt-10">
      <p className="sr-only">
        {lines.join(" ")} {payoff}
      </p>
      <div aria-hidden>
        {lines.map((line, i) => (
          <p
            key={i}
            data-line
            className={`m-0 text-h2 font-semibold leading-[1.16] tracking-tight ${
              line === "Мы строим не так." || line === "Скучная в основе. Живая на поверхности."
                ? "mt-10 text-ink"
                : "mt-3 text-ink-2"
            }`}
          >
            {line}
          </p>
        ))}
        <p
          data-payoff
          className="mt-14 inline-block text-h2 font-semibold leading-[1.16] tracking-tight text-signal-ink"
        >
          {payoff}
        </p>
      </div>
    </div>
  );
}
