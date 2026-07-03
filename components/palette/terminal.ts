"use client";

// Терминал палитры: посетитель печатает — сайт отвечает. Ответы честные:
// status/whoami читают реальные данные, enso --reseed реально пересобирает
// оттиск. Стиль CLI: prompt, коды выхода.

import { cases } from "@/lib/cases";
import { contacts } from "@/lib/site";
import { readGpu, readNavigationPerf, readStatic } from "@/lib/telemetry";
import { reseedEnso } from "@/lib/field-store";
import { flyTo } from "@/lib/scroll-store";
import { getPresenceCount } from "@/lib/presence-store";

export type TermLine = { text: string; kind: "in" | "out" | "err" };

export async function runCommand(raw: string): Promise<TermLine[]> {
  const input = raw.trim();
  const [cmd, ...args] = input.split(/\s+/);
  const out = (text: string): TermLine => ({ text, kind: "out" });
  const err = (text: string): TermLine => ({ text, kind: "err" });

  switch (cmd) {
    case "help":
      return [
        out("доступные команды:"),
        out("  ls works          — список кейсов"),
        out("  open <slug>       — перелёт к кейсу"),
        out("  status            — живой статус систем студии"),
        out("  whoami            — ваша телеметрия (локально)"),
        out("  hire              — открыть контакт"),
        out("  enso --reseed     — пересобрать оттиск"),
        out("  clear             — очистить"),
      ];

    case "ls":
      if (args[0] === "works") {
        return cases.map((c) => out(`${c.idx}  ${c.slug.padEnd(15)} ${c.type} · ${c.year}`));
      }
      return [out("works")];

    case "open": {
      const slug = args[0];
      const c = cases.find((x) => x.slug === slug || x.idx.toLowerCase() === slug?.toLowerCase());
      if (!c) return [err(`кейс не найден: ${slug ?? "?"} · exit 1`), out("подсказка: ls works")];
      flyTo("#works");
      return [out(`→ ${c.title} · exit 0`)];
    }

    case "status": {
      try {
        const r = await fetch("/api/status");
        if (!r.ok) throw new Error();
        const data: { targets: Array<{ name: string; ok: boolean; ms: number | null }> } =
          await r.json();
        if (!data.targets.length) {
          return [out("эндпоинты не сконфигурированы (STATUS_TARGETS) · exit 0")];
        }
        return data.targets.map((t) =>
          t.ok ? out(`● ${t.name} — live · ${t.ms} ms`) : err(`○ ${t.name} — down`),
        );
      } catch {
        return [err("status API недоступен · exit 1")];
      }
    }

    case "whoami": {
      const gpu = readGpu();
      const st = readStatic();
      const perf = readNavigationPerf();
      const visitors = getPresenceCount();
      return [
        out(`gpu: ${gpu ?? "software"}`),
        out(`cores: ${st.cores ?? "?"} · память: ${st.memoryGb ? `${st.memoryGb} GB` : "?"}`),
        out(`сеть: ${st.network ?? "?"} · вьюпорт: ${st.viewport.w}×${st.viewport.h}`),
        out(`документ: ${perf.transferKb ?? "—"} KB · ttfb: ${perf.ttfbMs ?? "—"} ms`),
        out(visitors != null ? `на сайте сейчас: ${visitors}` : "presence: офлайн"),
        out("(всё читается локально и никуда не отправляется)"),
      ];
    }

    case "hire":
      flyTo("#contact");
      return [out(`→ контакт · ${contacts.telegram.href} · exit 0`)];

    case "enso":
      if (args[0] === "--reseed") {
        return reseedEnso()
          ? [out("оттиск пересобран · второго такого нет · exit 0")]
          : [err("живое поле не поднято (нет WebGL2) · exit 1")];
      }
      return [out("usage: enso --reseed")];

    // пасхалки
    case "sudo":
      return [err("nice try. у системы нет root — она живёт сама · exit 1")];
    case "rm":
      return [err("процессы, которые живут без вас, так просто не удалить · exit 1")];

    case "":
      return [];

    default:
      return [err(`команда не найдена: ${cmd} · exit 127`), out("подсказка: help")];
  }
}
