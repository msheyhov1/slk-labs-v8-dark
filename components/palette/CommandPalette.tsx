"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cases } from "@/lib/cases";
import { contacts } from "@/lib/site";
import { flyTo } from "@/lib/scroll-store";
import { subscribePalette, closePalette, openPalette, paletteOpen } from "@/lib/palette-store";
import { runCommand, type TermLine } from "./terminal";

type Action = { id: string; label: string; hint?: string; run: () => void };

/**
 * Cmd+K палитра + терминал-режим. Ввод, начинающийся с ">" — команда CLI
 * (help, ls works, open, status, whoami, hire, enso --reseed). Ответы
 * печатаются с CLI-задержкой. Полностью клавиатурная.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [history, setHistory] = useState<TermLine[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const isTerm = query.startsWith(">");

  useEffect(
    () =>
      subscribePalette((o) => {
        setOpen(o);
        if (o) {
          // сброс — в колбэке внешнего события, не в эффекте
          setQuery("");
          setSelected(0);
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (paletteOpen()) closePalette();
        else openPalette();
      }
      if (e.key === "Escape" && paletteOpen()) closePalette();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [history]);

  const close = useCallback(() => closePalette(), []);

  const actions: Action[] = [
    ...cases.map((c) => ({
      id: `case-${c.slug}`,
      label: `Кейс: ${c.title}`,
      hint: c.stack,
      run: () => {
        flyTo("#works");
        close();
      },
    })),
    { id: "nav-works", label: "Перелёт: Работы", run: () => { flyTo("#works"); close(); } },
    { id: "nav-services", label: "Перелёт: Услуги", run: () => { flyTo("#services"); close(); } },
    { id: "nav-contact", label: "Перелёт: Контакт", run: () => { flyTo("#contact"); close(); } },
    {
      id: "tg",
      label: "Написать в Telegram",
      hint: "@slklabs",
      run: () => {
        window.open(contacts.telegram.href, "_blank", "noopener");
        close();
      },
    },
    {
      id: "mail",
      label: "Скопировать почту",
      hint: contacts.email,
      run: () => {
        navigator.clipboard?.writeText(contacts.email);
        close();
      },
    },
    {
      id: "term",
      label: "Терминал",
      hint: "> help",
      run: () => setQuery(">"),
    },
  ];

  const filtered = actions.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()),
  );

  const submitTerm = async () => {
    const cmd = query.slice(1).trim();
    setQuery(">");
    if (cmd === "clear") {
      setHistory([]);
      return;
    }
    setHistory((h) => [...h, { text: `visitor@slk-labs:~$ ${cmd}`, kind: "in" }]);
    setBusy(true);
    const lines = await runCommand(cmd);
    // CLI-задержка печати: строки приходят по очереди
    for (const line of lines) {
      await new Promise((r) => setTimeout(r, 55));
      setHistory((h) => [...h, line]);
    }
    setBusy(false);
    inputRef.current?.focus();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Командная палитра"
      className="fixed inset-0 z-[80] flex items-start justify-center bg-[rgba(22,19,13,0.5)] p-4 pt-[12vh]"
      onClick={close}
    >
      <div
        className="instrument-panel w-full max-w-[640px] rounded-sm shadow-[0_24px_80px_rgba(22,19,13,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--color-hud-line)] px-4 py-3">
          <span aria-hidden className="text-signal">{isTerm ? "❯" : "⌘"}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={(e) => {
              if (isTerm) {
                if (e.key === "Enter" && !busy) submitTerm();
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                filtered[selected]?.run();
              }
            }}
            placeholder="Команда, кейс… ( > — терминал )"
            aria-label="Поиск команды или терминальный ввод"
            className="w-full bg-transparent font-mono text-[14px] text-[var(--color-paper-fg)] outline-none placeholder:text-[var(--color-paper-fg-3)]"
          />
          <kbd className="shrink-0 rounded-sm border border-[var(--color-hud-line)] px-[6px] py-[2px] text-[10px] uppercase tracking-label opacity-60">
            esc
          </kbd>
        </div>

        {isTerm ? (
          <div
            ref={logRef}
            className="max-h-[46vh] overflow-y-auto px-4 py-3 font-mono text-[13px] leading-[1.75]"
            data-lenis-prevent
          >
            {history.length === 0 && (
              <div className="opacity-50">help — список команд</div>
            )}
            {history.map((l, i) => (
              <div
                key={i}
                className={
                  l.kind === "in"
                    ? "text-[var(--color-paper-fg-3)]"
                    : l.kind === "err"
                      ? "text-[var(--color-danger)]"
                      : "text-[var(--color-paper-fg)]"
                }
              >
                {l.text}
              </div>
            ))}
            {busy && <div className="opacity-50">…</div>}
          </div>
        ) : (
          <ul role="listbox" aria-label="Команды" className="max-h-[46vh] overflow-y-auto py-2" data-lenis-prevent>
            {filtered.map((a, i) => (
              <li key={a.id} role="option" aria-selected={i === selected}>
                <button
                  type="button"
                  onClick={a.run}
                  onMouseEnter={() => setSelected(i)}
                  className={`flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-[10px] text-left font-mono text-[13px] ${
                    i === selected
                      ? "bg-[rgba(236,229,214,0.08)] text-[var(--color-paper-fg)]"
                      : "text-[var(--color-paper-fg-2)]"
                  }`}
                >
                  <span>{a.label}</span>
                  {a.hint && <span className="text-[11px] opacity-50">{a.hint}</span>}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-4 py-3 font-mono text-[13px] opacity-50">
                ничего не найдено — попробуйте &gt; для терминала
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
