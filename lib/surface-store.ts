"use client";

// Активная поверхность (v7-паттерн): секции помечены data-surface,
// драйвер выбирает ближайшую к центру вьюпорта — хедер адаптируется
// (тёмная сцена → прозрачный+светлый; светлая → костяное стекло+тёмный).
// Единственный источник «где страница» — не плодить второй.

export type Surface = "dark" | "light";

let surface: Surface = "dark";
const listeners = new Set<() => void>();

export function setSurface(s: Surface) {
  if (s === surface) return;
  surface = s;
  listeners.forEach((l) => l());
}

export function getSurface(): Surface {
  return surface;
}

export function subscribeSurface(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Лёгкий драйвер: passive scroll + rAF-троттлинг, без React-стейта. */
export function startSurfaceDriver(): () => void {
  let raf = 0;

  const pick = () => {
    raf = 0;
    const mid = window.innerHeight / 2;
    let best: Surface = "dark";
    let bestDist = Infinity;
    document.querySelectorAll<HTMLElement>("[data-surface]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.top + r.height / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = (el.dataset.surface as Surface) ?? "dark";
      }
    });
    setSurface(best);
  };

  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(pick);
  };

  pick();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  };
}
