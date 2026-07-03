"use client";

import type { LivingFieldEngine } from "@/components/system/engine/field";
import { makeEnsoSeed } from "@/lib/seed";
import { readGpu } from "@/lib/telemetry";

// Доступ к живому полю извне (терминал: `enso --reseed`).
// В этом скине энсо-штриха нет — reseed пересобирает созвездие сети.
let field: LivingFieldEngine | null = null;

export function registerField(f: LivingFieldEngine | null) {
  field = f;
}

/** Пересобрать созвездие. false, если поле не поднято (нет WebGL2). */
export function reseedEnso(): boolean {
  if (!field) return false;
  field.reseed(makeEnsoSeed(readGpu()) ^ (performance.now() & 0xffff));
  return true;
}
