"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReduced } from "@/lib/gsap";
import {
  setPresenceCount,
  upsertPeer,
  removePeer,
  getPeers,
  type Peer,
} from "@/lib/presence-store";

const HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST; // без него — честный офлайн
const MAX_CURSORS = 15;
const SEND_HZ = 30;

type WireMsg =
  | { t: "count"; n: number }
  | { t: "cursor"; id: string; x: number; y: number }
  | { t: "leave"; id: string };

/**
 * Присутствие в реальном времени (PartyKit): счётчик + полупрозрачные
 * курсоры других посетителей (анонимные метки, без никнеймов). Координаты
 * нормированы к документу. Throttle 30 Гц, интерполяция на рендере,
 * максимум 15 видимых. Без NEXT_PUBLIC_PARTYKIT_HOST слой не поднимается.
 */
export function PresenceLayer() {
  const [, force] = useState(0);
  const rafRef = useRef(0);
  const touch = typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches;

  useEffect(() => {
    if (!HOST || prefersReduced()) return;

    let socket: WebSocket | null = null;
    let sendTimer = 0;
    let alive = true;

    (async () => {
      const { default: PartySocket } = await import("partysocket");
      if (!alive) return;
      socket = new PartySocket({ host: HOST, room: "slk" }) as unknown as WebSocket;

      socket.addEventListener("message", (e: MessageEvent) => {
        try {
          const msg = JSON.parse(String(e.data)) as WireMsg;
          if (msg.t === "count") setPresenceCount(msg.n);
          else if (msg.t === "cursor") upsertPeer({ id: msg.id, x: msg.x, y: msg.y, t: performance.now() });
          else if (msg.t === "leave") removePeer(msg.id);
        } catch {
          /* мусор в канале не роняет слой */
        }
      });

      if (!touch) {
        let last = 0;
        const onMove = (e: PointerEvent) => {
          const now = performance.now();
          if (now - last < 1000 / SEND_HZ) return;
          last = now;
          const x = (e.pageX / document.documentElement.scrollWidth) || 0;
          const y = (e.pageY / document.documentElement.scrollHeight) || 0;
          socket?.send(JSON.stringify({ t: "cursor", x, y }));
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        sendTimer = window.setInterval(() => {
          // heartbeat держит комнату честной
          socket?.send(JSON.stringify({ t: "ping" }));
        }, 20000);
        const cleanupMove = () => window.removeEventListener("pointermove", onMove);
        (socket as WebSocket).addEventListener("close", cleanupMove);
      }
    })();

    // рендер-цикл курсоров: лёгкая интерполяция, пиры старше 6с исчезают
    const tick = () => {
      const peers = getPeers();
      const now = performance.now();
      for (const [id, p] of peers) {
        if (now - p.t > 6000) peers.delete(id);
      }
      force((n) => n + 1);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      clearInterval(sendTimer);
      socket?.close();
      setPresenceCount(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!HOST) return null;

  const peers = Array.from(getPeers().values()).slice(0, MAX_CURSORS);

  // Мобайл: вместо курсоров — «пульс» присутствия в углу (мини-метки)
  if (touch) {
    if (!peers.length) return null;
    return (
      <div aria-hidden className="fixed bottom-4 left-4 z-[60] flex gap-1">
        {peers.slice(0, 6).map((p) => (
          <span key={p.id} className="live-pulse h-[6px] w-[6px] rounded-full bg-signal opacity-60" />
        ))}
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[55] overflow-hidden">
      {peers.map((p: Peer) => (
        <span
          key={p.id}
          className="absolute h-[10px] w-[10px] rounded-full border border-signal bg-[rgb(var(--color-signal-rgb)/0.25)] transition-transform duration-100 ease-linear"
          style={{
            transform: `translate(${p.x * document.documentElement.scrollWidth}px, ${p.y * document.documentElement.scrollHeight - window.scrollY}px)`,
          }}
        />
      ))}
    </div>
  );
}
