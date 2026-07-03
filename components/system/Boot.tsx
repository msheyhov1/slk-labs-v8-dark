"use client";

import { useEffect, useRef, useState } from "react";
import { readGpu, readNavigationPerf, readStatic } from "@/lib/telemetry";

const SKIP_KEY = "slk-booted";

/**
 * Boot-sequence: ~1.3 сек «пробуждение системы» — НАСТОЯЩИЕ строки лога
 * (реальный GPU, тайминги, вьюпорт). Оверлей рендерится и на сервере
 * (закрывает страницу до гидрации, hydration-mismatch нет); скрытие
 * решают CSS-правила (.boot-overlay) + инлайн-скрипт в layout:
 * повторный заход (sessionStorage) и reduced-motion гасятся ДО paint.
 * Skip — клик / Esc.
 */
export function Boot() {
  const [lines, setLines] = useState<string[]>([]);
  const [gone, setGone] = useState(false);
  const [dead, setDead] = useState(false);
  const timers = useRef<number[]>([]);
  const finished = useRef(false);

  useEffect(() => {
    const html = document.documentElement;
    // уже скрыт CSS'ом (повторный заход / reduced-motion) → только флаг
    if (html.dataset.booted === "1" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      html.dataset.booted = "1";
      timers.current.push(window.setTimeout(() => setDead(true), 0));
      return;
    }

    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      try {
        sessionStorage.setItem(SKIP_KEY, "1");
      } catch {
        /* private mode */
      }
      html.dataset.booted = "1";
      setGone(true);
      timers.current.push(window.setTimeout(() => setDead(true), 450));
    };

    const gpu = readGpu();
    const perf = readNavigationPerf();
    const st = readStatic();
    const boot: string[] = [
      `slk-labs v8 · living system`,
      `renderer: webgl2 · gpu: ${gpu ?? "software"}`,
      `viewport: ${st.viewport.w}×${st.viewport.h} @${st.dpr}x · cores: ${st.cores ?? "?"}`,
      `ttfb: ${perf.ttfbMs ?? "—"} ms · document: ${perf.transferKb ?? "—"} KB`,
      `network: seeding nodes…`,
      `ok`,
    ];
    boot.forEach((line, i) => {
      timers.current.push(
        window.setTimeout(() => setLines((p) => [...p, line]), 120 + i * 170),
      );
    });
    timers.current.push(window.setTimeout(finish, 1350));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    const t = timers.current;
    return () => {
      t.forEach(clearTimeout);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (dead) return null;

  return (
    <div
      role="presentation"
      onClick={() => {
        try {
          sessionStorage.setItem(SKIP_KEY, "1");
        } catch {
          /* private mode */
        }
        document.documentElement.dataset.booted = "1";
        setGone(true);
        timers.current.push(window.setTimeout(() => setDead(true), 450));
      }}
      className={`boot-overlay fixed inset-0 z-[90] flex cursor-pointer items-end bg-substrate p-[var(--gutter)] transition-opacity duration-[450ms] ease-[var(--ease-ink)] ${gone ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div className="font-mono text-[13px] leading-[1.8] text-[var(--color-ink-fg-3)]">
        {lines.map((l, i) => (
          <div key={i}>
            <span className="text-signal">▸</span> {l}
          </div>
        ))}
        <div className="mt-3 text-[11px] uppercase tracking-label opacity-60">
          клик / esc — пропустить
        </div>
      </div>
    </div>
  );
}
