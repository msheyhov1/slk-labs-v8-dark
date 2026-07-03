"use client";

import type Lenis from "lenis";

// Единственный источник «как лететь»: Lenis-инстанс для программных
// перелётов (палитра, якоря, терминал `open`). Без Lenis (reduced-motion)
// — нативный scrollIntoView.
let lenis: Lenis | null = null;

export function setLenis(l: Lenis | null) {
  lenis = l;
}

/** Перелёт к секции: ускорение → торможение (ease-scene), не прыжок. */
export function flyTo(target: string | HTMLElement) {
  if (lenis) {
    lenis.scrollTo(target, {
      duration: 1.1,
      easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
      offset: -64,
    });
  } else {
    const el =
      typeof target === "string" ? document.querySelector(target) : target;
    el?.scrollIntoView({ block: "start" });
  }
}
