"use client";

// Микро pub/sub для командной палитры: открыть можно из хедера, терминала,
// пасхалки — один источник состояния, без контекст-провайдера.
type Listener = (open: boolean) => void;

let isOpen = false;
const listeners = new Set<Listener>();

export function openPalette() {
  isOpen = true;
  listeners.forEach((l) => l(isOpen));
}

export function closePalette() {
  isOpen = false;
  listeners.forEach((l) => l(isOpen));
}

export function subscribePalette(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function paletteOpen() {
  return isOpen;
}
