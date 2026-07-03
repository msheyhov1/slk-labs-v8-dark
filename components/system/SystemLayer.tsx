"use client";

import dynamic from "next/dynamic";
import { Boot } from "./Boot";

// Приборный слой — прогрессивное улучшение поверх контента.
// Всё client-only и лениво: HUD, палитра/терминал, realtime-присутствие.
const Hud = dynamic(() => import("@/components/hud/Hud").then((m) => m.Hud), { ssr: false });
const CommandPalette = dynamic(
  () => import("@/components/palette/CommandPalette").then((m) => m.CommandPalette),
  { ssr: false },
);
const PresenceLayer = dynamic(
  () => import("@/components/presence/PresenceLayer").then((m) => m.PresenceLayer),
  { ssr: false },
);

export function SystemLayer() {
  return (
    <>
      <Boot />
      <Hud />
      <CommandPalette />
      <PresenceLayer />
    </>
  );
}
