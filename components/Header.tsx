"use client";

import { useEffect, useSyncExternalStore } from "react";
import { nav } from "@/lib/site";
import { flyTo } from "@/lib/scroll-store";
import { openPalette } from "@/lib/palette-store";
import { getSurface, subscribeSurface, startSurfaceDriver } from "@/lib/surface-store";

/**
 * Хедер Dala: прозрачный бар прямо на void, без рамки и без backdrop-blur.
 * Лого-марк (фиолетовый треугольник) + вордмарк белым; nav — ash→white;
 * справа — единственная заливка-действие: фиолетовая пилюля.
 * Поверхность везде void, поэтому цвета униформны (сцена больше не светлеет).
 */
export function Header() {
  // surface-driver сохранён (сцены помечают data-surface), но в Dala
  // палитра униформна — ветвления по поверхности больше нет.
  useSyncExternalStore(subscribeSurface, getSurface, () => "dark" as const);
  useEffect(() => startSurfaceDriver(), []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-[var(--header-h)] items-center bg-transparent">
      <div className="mx-auto flex w-full max-w-[var(--container-max)] items-center justify-between gap-6 px-[var(--gutter)] max-[360px]:gap-3">
        <a
          href="#top"
          aria-label="SLK-labs — на главную"
          onClick={(e) => {
            e.preventDefault();
            flyTo("#top");
          }}
          className="flex items-center gap-[10px] text-[var(--color-bone-white)] no-underline"
        >
          {/* марк-треугольник: осколок бренда (эхо частиц поля), iris */}
          <svg aria-hidden viewBox="0 0 16 16" className="h-[15px] w-[15px] shrink-0">
            <path d="M8 2 L14 13.4 L2 13.4 Z" fill="var(--color-iris)" />
          </svg>
          <span className="text-[17px] font-semibold tracking-tight">
            SLK<span className="font-normal text-[var(--color-ash)]">-labs</span>
          </span>
        </a>

        <div className="flex items-center gap-5 max-[360px]:gap-3 sm:gap-7">
          <nav aria-label="Основная навигация" className="hidden items-center gap-7 sm:flex">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={(e) => {
                  e.preventDefault();
                  flyTo(n.href);
                }}
                className="flex min-h-[44px] items-center whitespace-nowrap text-[13px] font-semibold uppercase tracking-label text-[var(--color-ash)] no-underline transition-colors duration-[var(--dur-micro)] ease-standard hover:text-[var(--color-bone-white)]"
              >
                {n.label}
              </a>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => openPalette()}
            aria-label="Открыть командную палитру (Cmd+K)"
            className="hidden min-h-[36px] cursor-pointer items-center gap-2 rounded-full border border-[var(--color-hairline-on-ink-strong)] px-[12px] font-mono text-[11px] uppercase tracking-label text-[var(--color-ash)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--color-bone-white)] sm:flex"
          >
            <span aria-hidden>⌘K</span>
          </button>

          <a
            href="#contact"
            onClick={(e) => {
              e.preventDefault();
              flyTo("#contact");
            }}
            className="hanko inline-flex min-h-[36px] items-center px-5 text-[13px] font-semibold uppercase tracking-label no-underline"
          >
            Связаться
          </a>
        </div>
      </div>
    </header>
  );
}
