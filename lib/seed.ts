"use client";

// Seed оттиска-энсо: время + viewport + GPU-строка, хешируются ЛОКАЛЬНО
// (FNV-1a). Ничего не отправляется — это не fingerprint-трекинг, а зерно
// уникального штриха: «Этот оттиск собран для вас. Второго такого нет.»

export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeEnsoSeed(gpu: string | null): number {
  const src = `${Date.now()}|${window.innerWidth}x${window.innerHeight}|${gpu ?? "gpu?"}`;
  return fnv1a(src);
}

/** Детерминированный PRNG (mulberry32) от seed — один штрих на один seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
