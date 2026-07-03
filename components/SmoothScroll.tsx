"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger, prefersReduced } from "@/lib/gsap";
import { setLenis } from "@/lib/scroll-store";

/**
 * «Полёт»: инерционный скролл (Lenis) ↔ GSAP ticker ↔ ScrollTrigger.
 * - <html class="js"> включает reveal-грамматику (no-JS остаётся видимым);
 * - prefers-reduced-motion → нативный скролл, Lenis не поднимаем;
 * - инстанс кладётся в scroll-store: палитра/якоря делают «перелёт»
 *   (ускорение → торможение), а не мгновенный прыжок.
 */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("js");

    if (prefersReduced()) {
      ScrollTrigger.refresh();
      return;
    }

    const lenis = new Lenis({
      lerp: 0.12,
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: false,
    });
    setLenis(lenis);

    lenis.on("scroll", ScrollTrigger.update);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);

    return () => {
      gsap.ticker.remove(raf);
      window.removeEventListener("load", refresh);
      setLenis(null);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
