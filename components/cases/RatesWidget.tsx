"use client";

import { useEffect, useState } from "react";

type Rates = { price: number; series: number[]; ts: number } | null;

/**
 * Живой виджет «Дозора»: настоящий курс USDT/RUB (edge-прокси /api/rates,
 * кэш 60с) + спарклайн за час. Кейс не описывается — кейс работает.
 * Если API молчит — виджет честно скрывается.
 */
export function RatesWidget() {
  const [rates, setRates] = useState<Rates>(null);
  const [dead, setDead] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/rates");
        if (!r.ok) throw new Error();
        const data = await r.json();
        if (alive && data?.price) setRates(data);
      } catch {
        if (alive) setDead(true);
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (dead || !rates) return null;

  const { series } = rates;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pts = series
    .map((v, i) => `${(i / (series.length - 1)) * 100},${28 - ((v - min) / span) * 24}`)
    .join(" ");

  return (
    <div className="mt-4 border-t border-[var(--color-hairline-on-ink-soft)] pt-3" aria-label="Живой курс USDT/RUB">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-label text-[var(--color-ink-fg-3)]">
          USDT/RUB · live
        </span>
        <span className="font-mono text-[15px] font-medium text-[var(--color-ink-fg)]">
          {rates.price.toFixed(2)} ₽
        </span>
      </div>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 h-[30px] w-full" aria-hidden>
        <polyline
          points={pts}
          fill="none"
          stroke="var(--color-signal)"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
