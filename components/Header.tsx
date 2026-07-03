"use client";

import { useEffect, useSyncExternalStore } from "react";
import { nav } from "@/lib/site";
import { flyTo } from "@/lib/scroll-store";
import { openPalette } from "@/lib/palette-store";
import { getSurface, subscribeSurface, startSurfaceDriver } from "@/lib/surface-store";

/**
 * Хедер v7: адаптивный к поверхности активной сцены — прозрачный со светлым
 * текстом над тёмным полем, костяное стекло с тёмным текстом над приборами.
 */
export function Header() {
  const surface = useSyncExternalStore(subscribeSurface, getSurface, () => "dark" as const);
  const dark = surface === "dark";

  useEffect(() => startSurfaceDriver(), []);

  const shell = dark
    ? "border-transparent bg-transparent"
    : "border-hairline bg-[var(--color-bone-glass)] backdrop-blur-[14px]";
  const logo = dark ? "text-[var(--color-ink-fg)]" : "text-ink";
  const suffix = dark ? "text-[var(--color-ink-fg-3)]" : "text-ink-2";
  const link = dark
    ? "text-[var(--color-ink-fg-3)] hover:text-[var(--color-ink-fg)]"
    : "text-ink-2 hover:text-ink";
  const kbtn = dark
    ? "border-[var(--color-hairline-on-ink-strong)] text-[var(--color-ink-fg-3)] hover:text-[var(--color-ink-fg)]"
    : "border-hairline bg-bone-sunken text-ink-2 hover:text-ink";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 flex h-[var(--header-h)] items-center border-b transition-colors duration-300 ease-standard ${shell}`}
    >
      <div className="mx-auto flex w-full max-w-[var(--container-max)] items-center justify-between gap-6 px-[var(--gutter)] max-[360px]:gap-3">
        <a
          href="#top"
          aria-label="SLK-labs — на главную"
          onClick={(e) => {
            e.preventDefault();
            flyTo("#top");
          }}
          className={`flex items-center gap-[10px] no-underline ${logo}`}
        >
          {/* мини-энсо: сигнальный узел системы */}
          <svg aria-hidden viewBox="0 0 16 16" className="h-[14px] w-[14px] shrink-0">
            <path
              d="M 8 2.4 A 5.6 5.6 0 1 1 4.1 4.2"
              fill="none"
              stroke={dark ? "var(--color-signal)" : "var(--color-signal-ink)"}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[17px] font-semibold tracking-tight">
            SLK<span className={`font-mono ${suffix}`}>-labs</span>
          </span>
        </a>

        <div className="flex items-center gap-5 max-[360px]:gap-3 sm:gap-7">
          <nav aria-label="Основная навигация" className="flex items-center gap-5 max-[360px]:gap-3 sm:gap-7">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={(e) => {
                  e.preventDefault();
                  flyTo(n.href);
                }}
                className={`flex min-h-[44px] items-center whitespace-nowrap font-mono text-[12px] uppercase tracking-label no-underline transition-colors duration-[var(--dur-micro)] ease-standard sm:text-[13px] ${link}`}
              >
                {n.label}
              </a>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => openPalette()}
            aria-label="Открыть командную палитру (Cmd+K)"
            className={`hidden min-h-[32px] cursor-pointer items-center gap-2 rounded-sm border px-[10px] font-mono text-[11px] uppercase tracking-label transition-colors duration-[var(--dur-micro)] sm:flex ${kbtn}`}
          >
            <span aria-hidden>⌘K</span>
          </button>
        </div>
      </div>
    </header>
  );
}
