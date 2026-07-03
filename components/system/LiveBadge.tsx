"use client";

import { useSyncExternalStore } from "react";
import { subscribePresence, getPresenceCount } from "@/lib/presence-store";

/**
 * LIVE-строка героя: пульс + счётчик «сейчас на сайте» из настоящего
 * realtime (PartyKit). Без бекенда счётчик честно не показывается —
 * никаких нарисованных цифр.
 */
export function LiveBadge() {
  const count = useSyncExternalStore(subscribePresence, getPresenceCount, () => null);

  return (
    <span className="flex items-center gap-2 whitespace-nowrap font-mono text-[13px] tracking-[0.06em] text-signal">
      <span aria-hidden className="signal-glow live-pulse h-[7px] w-[7px] rounded-full bg-signal" />
      LIVE
      {count !== null && count > 0 && (
        <span className="text-[var(--color-ink-fg-3)]">
          · сейчас на сайте: {count}
        </span>
      )}
    </span>
  );
}
