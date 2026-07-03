"use client";

import { useEffect, useRef } from "react";
import { gsap, prefersReduced } from "@/lib/gsap";
import { motion } from "@/lib/motion";

/**
 * Чернильный ревил: контент касается бумаги и оседает (bleed, не фейд).
 * Дочерние [data-reveal] проявляются со стаггером по ScrollTrigger.
 */
export function Reveal({
  children,
  className = "",
  stagger = false,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced()) return;

    const targets = stagger
      ? Array.from(el.querySelectorAll<HTMLElement>("[data-reveal]"))
      : [el];
    if (stagger && targets.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { autoAlpha: 0, y: 22, filter: "blur(3px)" },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: motion.dur.base,
          ease: motion.ease.ink,
          stagger: stagger ? motion.stagger : 0,
          scrollTrigger: { trigger: el, start: "top 82%", once: true },
        },
      );
    }, el);

    return () => ctx.revert();
  }, [stagger]);

  // без stagger сам контейнер и есть цель ревила
  return (
    <div ref={ref} className={className} {...(stagger ? {} : { "data-reveal": "" })}>
      {children}
    </div>
  );
}
