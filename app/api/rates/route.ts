import { NextResponse } from "next/server";

// Живой курс USDT/RUB для кейса «Дозор»: публичные клины Binance через
// прокси (кэш 60с) — реальные данные, реальный спарклайн за час.

type Payload = { price: number; series: number[]; ts: number };

let cache: { at: number; data: Payload } | null = null;
const TTL = 60_000;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < TTL) {
    return NextResponse.json(cache.data);
  }
  try {
    const r = await fetch(
      "https://api.binance.com/api/v3/klines?symbol=USDTRUB&interval=5m&limit=12",
      { cache: "no-store", signal: AbortSignal.timeout(4000) },
    );
    if (!r.ok) throw new Error(`binance ${r.status}`);
    const klines: Array<[number, string, string, string, string]> = await r.json();
    const series = klines.map((k) => parseFloat(k[4])); // close
    const data: Payload = {
      price: series[series.length - 1],
      series,
      ts: now,
    };
    cache = { at: now, data };
    return NextResponse.json(data);
  } catch {
    // источник недоступен — виджет честно скроется
    return NextResponse.json({ error: "rates-unavailable" }, { status: 502 });
  }
}
