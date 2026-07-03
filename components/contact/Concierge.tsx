"use client";

import { useEffect, useRef, useState } from "react";
import { contacts } from "@/lib/site";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * AI-консьерж студии: Claude через серверный /api/concierge (ключ только
 * на сервере). Без ключа API честно отвечает 503 — виджет показывает
 * прямые контакты вместо фейкового «бота».
 */
export function Concierge({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Здравствуйте! Я консьерж SLK-labs. Расскажите, какую задачу хотите автоматизировать — сайт, бот или процесс?",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const r = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (r.status === 503) {
        setOffline(true);
        return;
      }
      if (!r.ok) throw new Error();
      const data = await r.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Связь прервалась. Напишите нам напрямую в Telegram — ответим быстро." },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Чат с консьержем SLK-labs"
      className="fixed inset-0 z-[85] flex items-end justify-center bg-[rgba(22,19,13,0.45)] p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="instrument-panel flex h-[min(72vh,560px)] w-full max-w-[480px] flex-col rounded-sm"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-hud-line)] px-4 py-3">
          <span className="flex items-center gap-2 text-[12px] uppercase tracking-label">
            <span aria-hidden className="live-pulse h-[6px] w-[6px] rounded-full bg-signal" />
            Консьерж · узел системы
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть чат"
            className="cursor-pointer opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>

        <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto p-4 text-[13.5px] leading-[1.65]" data-lenis-prevent>
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-8 rounded-sm bg-[rgba(236,229,214,0.1)] px-3 py-2"
                  : "mr-8 text-[var(--color-paper-fg-2)]"
              }
            >
              {m.content}
            </div>
          ))}
          {busy && <div className="mr-8 opacity-50">думаю…</div>}
          {offline && (
            <div className="mr-8 border-l-2 border-signal pl-3 text-[var(--color-paper-fg-2)]">
              Консьерж сейчас офлайн (ключ не настроен). Напишите напрямую:{" "}
              <a href={contacts.telegram.href} className="text-signal underline" target="_blank" rel="noopener noreferrer">
                {contacts.telegram.label}
              </a>{" "}
              или {contacts.email}.
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-[var(--color-hud-line)] p-3">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={offline}
            placeholder={offline ? "офлайн" : "Опишите задачу…"}
            aria-label="Сообщение консьержу"
            className="w-full rounded-sm bg-[rgba(236,229,214,0.07)] px-3 py-2 text-[13.5px] text-[var(--color-paper-fg)] outline-none placeholder:text-[var(--color-paper-fg-3)]"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || offline}
            className="hanko cursor-pointer px-4 py-2 font-mono text-[12px] uppercase tracking-label disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
