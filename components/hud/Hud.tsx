"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  readGpu,
  readNavigationPerf,
  readStatic,
  observeLcp,
  startFpsMeter,
  type Telemetry,
} from "@/lib/telemetry";
import { subscribePresence, getPresenceCount } from "@/lib/presence-store";

/**
 * HUD «жизненные показатели» — бортовой самописец в углу. Все цифры
 * настоящие: rAF-FPS, Performance API, WEBGL_debug_renderer_info,
 * hardwareConcurrency, Network Information API. Панч: «Ваш {GPU} ·
 * держим 60 fps» — флекс и доказательство одновременно.
 */
export function Hud() {
  const [open, setOpen] = useState(false);
  const [fps, setFps] = useState<number | null>(null);
  // компонент client-only (ssr:false) — статичная телеметрия читается
  // прямо в инициализаторе, без каскадного setState в эффекте
  const [tele, setTele] = useState<Partial<Telemetry>>(() => ({
    gpu: readGpu(),
    ...readStatic(),
    ...readNavigationPerf(),
  }));
  const visitors = useSyncExternalStore(subscribePresence, getPresenceCount, () => null);

  useEffect(() => {
    // LCP уточняется по мере загрузки — подписка, setState в колбэке
    return observeLcp((lcpMs) => setTele((t) => ({ ...t, lcpMs })));
  }, []);

  // FPS-метр крутится только при развёрнутом HUD — сам HUD не жрёт кадры.
  // Первое окно замера пропускаем: открытие панели джанкает кадр и врёт.
  useEffect(() => {
    if (!open) return;
    let warm = false;
    return startFpsMeter((v) => {
      if (!warm) {
        warm = true;
        return;
      }
      setFps(v);
    });
  }, [open]);

  const row = (label: string, value: string | number | null | undefined) => (
    <div className="flex justify-between gap-6">
      <span className="opacity-50">{label}</span>
      <span className="text-right">{value ?? "—"}</span>
    </div>
  );

  return (
    <div className="fixed bottom-4 right-4 z-[70] hidden sm:block print:hidden">
      {open ? (
        <div className="instrument-panel w-[300px] rounded-sm p-4 text-[12px] leading-[1.7] shadow-[0_12px_40px_rgba(22,19,13,0.35)]">
          <div className="mb-2 flex items-center justify-between border-b border-[var(--color-hud-line)] pb-2">
            <span className="uppercase tracking-label opacity-70">Телеметрия</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Свернуть телеметрию"
              className="cursor-pointer opacity-60 hover:opacity-100"
            >
              ▁
            </button>
          </div>
          {row("fps", fps)}
          {row("gpu", tele.gpu)}
          {row("ядра cpu", tele.cores)}
          {row("сеть", tele.network)}
          {row("документ", tele.transferKb != null ? `${tele.transferKb} KB` : null)}
          {row("ttfb", tele.ttfbMs != null ? `${tele.ttfbMs} ms` : null)}
          {row("lcp", tele.lcpMs != null ? `${tele.lcpMs} ms` : null)}
          {row("на сайте", visitors)}
          {tele.gpu && fps !== null && (
            <div className="mt-3 border-t border-[var(--color-hud-line)] pt-2 text-[11px] leading-[1.5] opacity-70">
              Ваш {tele.gpu} · держим {fps >= 58 ? 60 : fps} fps
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Развернуть телеметрию"
          className="instrument-panel flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-[11px] uppercase tracking-label transition-opacity hover:opacity-100"
        >
          <span aria-hidden className="live-pulse h-[6px] w-[6px] rounded-full bg-signal" />
          телеметрия
        </button>
      )}
    </div>
  );
}
