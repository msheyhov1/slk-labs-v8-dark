import { NextResponse } from "next/server";

// Живые health-check'и реальных систем студии.
// ENV STATUS_TARGETS="имя|https://url/health,имя2|https://url2" — без него
// отдаём пустой список (UI честно молчит). Кэш 60с на инстанс.

type Target = { name: string; ok: boolean; ms: number | null };

let cache: { at: number; targets: Target[] } | null = null;
const TTL = 60_000;
const TIMEOUT = 3_500;

function parseTargets(): Array<{ name: string; url: string }> {
  const raw = process.env.STATUS_TARGETS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [name, url] = s.split("|").map((x) => x.trim());
      return name && url ? { name, url } : null;
    })
    .filter((x): x is { name: string; url: string } => x !== null);
}

async function ping(name: string, url: string): Promise<Target> {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    return { name, ok: r.ok, ms: Date.now() - started };
  } catch {
    return { name, ok: false, ms: null };
  }
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < TTL) {
    return NextResponse.json({ targets: cache.targets, cached: true });
  }
  const list = parseTargets();
  const targets = list.length
    ? await Promise.all(list.map((t) => ping(t.name, t.url)))
    : [];
  cache = { at: now, targets };
  return NextResponse.json({ targets, cached: false });
}
