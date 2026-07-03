"use client";

import { useEffect, useRef, useState } from "react";
import type { Case } from "@/lib/cases";

/**
 * «Окно ОС»: живой сайт проекта в sandbox-iframe — работа открыта, не
 * описана. Перетаскивается за заголовок (десктоп), разворачивается,
 * закрывается по Esc. Фоллбек embed:"video" — запись экрана (Mini App /
 * X-Frame-Options); embed:"none" — только факты.
 */
export function CaseWindow({ c, onClose }: { c: Case; onClose: () => void }) {
  const [maximized, setMaximized] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (maximized) return;
    drag.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({
      x: drag.current.px + e.clientX - drag.current.sx,
      y: drag.current.py + e.clientY - drag.current.sy,
    });
  };
  const onPointerUp = () => (drag.current = null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Кейс ${c.title}`}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-[rgba(22,19,13,0.55)] p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={maximized ? undefined : { transform: `translate(${pos.x}px, ${pos.y}px)` }}
        className={`case-window flex flex-col overflow-hidden rounded-sm border border-hairline bg-bone shadow-[0_32px_100px_rgba(22,19,13,0.55)] ${
          maximized ? "h-full w-full" : "h-[min(80vh,760px)] w-[min(96vw,1100px)]"
        }`}
      >
        {/* заголовок окна */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className={`flex select-none items-center gap-3 border-b border-hairline bg-bone-sunken px-4 py-[10px] ${maximized ? "" : "cursor-grab active:cursor-grabbing"}`}
        >
          <span className="flex gap-[6px]">
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Закрыть окно"
              className="h-[12px] w-[12px] cursor-pointer rounded-full bg-signal-ink hover:bg-ink"
            />
            <button
              type="button"
              onClick={() => setMaximized((m) => !m)}
              aria-label={maximized ? "Свернуть окно" : "Развернуть окно"}
              className="h-[12px] w-[12px] cursor-pointer rounded-full border border-ink-2 bg-transparent hover:bg-hairline"
            />
          </span>
          <span className="ml-2 truncate font-mono text-[12px] tracking-[0.04em] text-ink-2">
            {c.idx} · {c.title} — {c.embed === "iframe" ? (c.liveUrl ?? "") : c.type}
          </span>
        </div>

        {/* содержимое: живой проект + колонка фактов */}
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div className="min-h-0 flex-1 bg-bone-sunken">
            {c.embed === "iframe" && c.liveUrl && (
              <iframe
                src={c.liveUrl}
                title={`${c.title} — живой сайт`}
                loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                className="h-full w-full border-0"
              />
            )}
            {c.embed === "video" && c.videoSrc && (
              <video
                src={c.videoSrc}
                poster={c.videoPoster}
                muted
                loop
                autoPlay
                playsInline
                className="h-full w-full object-contain"
              />
            )}
            {((c.embed === "iframe" && !c.liveUrl) ||
              (c.embed === "video" && !c.videoSrc) ||
              c.embed === "none") && (
              <div className="flex h-full items-center justify-center p-8">
                <p className="max-w-[38ch] text-center font-mono text-[13px] leading-[1.8] text-ink-2">
                  {c.windowNote ?? "Живое окно подключается."}
                </p>
              </div>
            )}
          </div>

          <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-t border-hairline p-5 sm:w-[260px] sm:border-l sm:border-t-0" data-lenis-prevent>
            <p className="m-0 text-small leading-body text-ink">{c.summary}</p>
            <dl className="m-0 space-y-3">
              {c.facts.map((f) => (
                <div key={f.label}>
                  <dt className="font-mono text-[11px] uppercase tracking-label text-ink-2">
                    {f.label}
                  </dt>
                  <dd className="m-0 mt-1 text-small text-ink">{f.value}</dd>
                </div>
              ))}
            </dl>
            {c.liveUrl && (
              <a
                href={c.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hanko inline-block px-4 py-2 font-mono text-[12px] uppercase tracking-label no-underline"
              >
                Открыть вживую ↗
              </a>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
