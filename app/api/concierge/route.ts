import { NextResponse } from "next/server";

// AI-консьерж: Claude API через серверный ключ (ANTHROPIC_API_KEY —
// только env, никогда NEXT_PUBLIC). Без ключа — 503, клиент показывает
// прямые контакты. Rate-limit по IP: 20 сообщений / 10 минут на инстанс.
// Опционально: TELEGRAM_NOTIFY_TOKEN + TELEGRAM_NOTIFY_CHAT — форвард
// брифа в Telegram студии.

const MODEL = "claude-haiku-4-5-20251001";
const WINDOW = 10 * 60_000;
const LIMIT = 20;
const hits = new Map<string, number[]>();

const SYSTEM = `Ты — консьерж студии SLK-labs (сайты, Telegram-боты, автоматизация процессов).
Пэйофф студии: «Процессы, которые живут без вас». Кейсы: New Link Food (билингвальный сайт с 3D-глобусом),
Смена (Telegram Mini App сменного планирования), Дозор (AML-мониторинг TRC20).
Отвечай кратко (2-4 предложения), по-русски, дружелюбно и по делу. Твоя цель — понять задачу посетителя
(что автоматизировать, какие сроки/бюджет) и мягко довести до брифа. Когда бриф ясен, предложи связаться:
Telegram @slklabs или hello@slk-labs.studio. Не выдумывай цен и сроков, не обещай от имени студии.`;

function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > LIMIT;
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "concierge-offline" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }

  let body: { messages?: Array<{ role: string; content: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-16)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 2000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM,
        messages,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}`);
    const data = await r.json();
    const reply: string =
      data.content?.map((b: { type: string; text?: string }) => b.text ?? "").join("") ??
      "Не расслышал — повторите, пожалуйста.";

    // бриф в Telegram студии (опционально, fire-and-forget)
    const tgToken = process.env.TELEGRAM_NOTIFY_TOKEN;
    const tgChat = process.env.TELEGRAM_NOTIFY_CHAT;
    if (tgToken && tgChat) {
      const last = messages[messages.length - 1].content;
      fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: tgChat,
          text: `Консьерж v8 · посетитель: ${last.slice(0, 500)}`,
        }),
      }).catch(() => {});
    }

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
