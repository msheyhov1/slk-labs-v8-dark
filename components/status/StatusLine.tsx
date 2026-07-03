"use client";

import { useEffect, useState } from "react";

type Target = { name: string; ok: boolean; ms: number | null };

/**
 * Публичный статус реальных систем студии: «мы говорим, что процессы
 * живут без нас — вот они, живые, проверьте». Данные с /api/status
 * (edge-пинг, кэш 60с). Без сконфигурированных эндпоинтов строка
 * не рендерится вовсе — ничего нарисованного.
 */
export function StatusLine() {
  const [targets, setTargets] = useState<Target[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/status");
        if (!r.ok) return;
        const data = await r.json();
        if (alive && Array.isArray(data.targets) && data.targets.length) {
          setTargets(data.targets);
        }
      } catch {
        /* нет статуса — нет строки */
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!targets) return null;

  return (
    <div
      aria-label="Живой статус систем студии"
      className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-hairline py-5 font-mono text-[12px] tracking-[0.04em]"
    >
      <span className="uppercase tracking-label text-ink-2">Системы в проде:</span>
      {targets.map((t) => (
        <span key={t.name} className="flex items-center gap-2">
          <span
            aria-hidden
            className={`h-[7px] w-[7px] rounded-full ${t.ok ? "live-pulse bg-signal-ink" : "bg-ink-2"}`}
          />
          <span className="text-ink">{t.name}</span>
          <span className="text-ink-2">{t.ok ? `${t.ms} ms` : "down"}</span>
        </span>
      ))}
    </div>
  );
}
