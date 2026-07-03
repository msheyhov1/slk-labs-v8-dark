"use client";

// Presence (PartyKit) — единый стор: счётчик посетителей + курсоры пиров.
// Пишет PresenceLayer, читают LiveBadge/HUD/мини-карта. Без бекенда
// (нет NEXT_PUBLIC_PARTYKIT_HOST) count = null — UI честно молчит.

export type Peer = { id: string; x: number; y: number; t: number };

type Snapshot = { count: number | null };

let snapshot: Snapshot = { count: null };
const peers = new Map<string, Peer>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setPresenceCount(count: number | null) {
  snapshot = { count };
  emit();
}

export function upsertPeer(p: Peer) {
  peers.set(p.id, p);
}

export function removePeer(id: string) {
  peers.delete(id);
}

export function getPeers() {
  return peers;
}

export function subscribePresence(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getPresenceCount() {
  return snapshot.count;
}
