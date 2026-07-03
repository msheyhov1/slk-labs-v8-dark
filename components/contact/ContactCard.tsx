"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { gsap, prefersReduced } from "@/lib/gsap";
import { MonoLabel } from "@/components/ui/MonoLabel";
import type { ContactScene } from "@/lib/content/contact";

// консьерж грузится только по клику
const ConciergeLazy = dynamic(
  () => import("@/components/contact/Concierge").then((m) => m.Concierge),
  { ssr: false },
);

type Link = { scene: ContactScene; label: string; value: string; href: string };

const playedScenes = new Set<ContactScene>(); // сцена играет один раз за сессию

/**
 * Контактная карточка с микро-сценой (≤800мс, CSS/GSAP-трансформы):
 * - plane: самолётик улетает по кривой Безье → t.me;
 * - envelope: карточка складывается, штемпель SLK → адрес в буфере + тост;
 * - concierge: карточка «распечатывается» → чат AI-консьержа.
 * Повторный клик и prefers-reduced-motion — мгновенное действие.
 */
export function ContactCard({ link }: { link: Link }) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const planeRef = useRef<SVGSVGElement>(null);
  const stampRef = useRef<HTMLSpanElement>(null);
  const [toast, setToast] = useState(false);
  const [concierge, setConcierge] = useState(false);
  const busy = useRef(false);

  const doAction = () => {
    if (link.scene === "plane") {
      window.open(link.href, "_blank", "noopener");
    } else if (link.scene === "envelope") {
      navigator.clipboard?.writeText(link.value).then(() => {
        setToast(true);
        setTimeout(() => setToast(false), 2200);
      });
    } else {
      setConcierge(true);
    }
  };

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (busy.current) return;
    if (prefersReduced() || playedScenes.has(link.scene)) {
      doAction();
      return;
    }
    playedScenes.add(link.scene);
    busy.current = true;

    if (link.scene === "plane" && planeRef.current && cardRef.current) {
      // самолётик по кубической Безье за правый верхний край
      const plane = planeRef.current;
      const from = { t: 0 };
      const r = cardRef.current.getBoundingClientRect();
      const p0 = { x: 0, y: 0 };
      const p1 = { x: r.width * 0.4, y: -80 };
      const p2 = { x: r.width * 0.9, y: -160 };
      const p3 = { x: window.innerWidth - r.left + 80, y: -240 };
      gsap.set(plane, { opacity: 1 });
      gsap.to(from, {
        t: 1,
        duration: 0.75,
        ease: "power2.in",
        onUpdate: () => {
          const t = from.t;
          const u = 1 - t;
          const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
          const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
          gsap.set(plane, { x, y, rotate: 14 + t * 30, scale: 1 - t * 0.4 });
        },
        onComplete: () => {
          gsap.set(plane, { opacity: 0, x: 0, y: 0, rotate: 0, scale: 1 });
          busy.current = false;
          doAction();
        },
      });
    } else if (link.scene === "envelope" && cardRef.current && stampRef.current) {
      // конверт: лёгкий сгиб + штемпель впечатывается (ease-stamp)
      const tl = gsap.timeline({
        onComplete: () => {
          busy.current = false;
          doAction();
        },
      });
      tl.to(cardRef.current, { scaleY: 0.86, transformOrigin: "top", duration: 0.22, ease: "power2.in" })
        .to(cardRef.current, { scaleY: 1, duration: 0.24, ease: "power2.out" })
        .fromTo(
          stampRef.current,
          { opacity: 0, scale: 1.6, rotate: -8 },
          { opacity: 1, scale: 1, rotate: -8, duration: 0.3, ease: "back.out(1.7)" },
          "-=0.1",
        )
        .to(stampRef.current, { opacity: 0, duration: 0.3, delay: 0.15 });
    } else {
      busy.current = false;
      doAction();
    }
  };

  return (
    <>
      <a
        ref={cardRef}
        href={link.href}
        onClick={onClick}
        target={link.scene === "plane" ? "_blank" : undefined}
        rel={link.scene === "plane" ? "noopener noreferrer" : undefined}
        className="tile-bone border border-hairline group relative flex items-center justify-between gap-4 overflow-visible rounded-sm px-[22px] py-[18px] no-underline transition-colors duration-[var(--dur-micro)] hover:border-[color:var(--color-signal-ink)] active:border-[color:var(--color-signal-ink)]"
      >
        <span className="flex flex-col gap-[6px]">
          <MonoLabel>{link.label}</MonoLabel>
          <span className="text-[1.1rem] font-medium tracking-tight text-ink">{link.value}</span>
        </span>
        <span
          aria-hidden
          className="text-[1.2rem] text-signal-ink transition-transform duration-[var(--dur-micro)] group-hover:-translate-y-[2px] group-hover:translate-x-[2px] group-active:-translate-y-[2px] group-active:translate-x-[2px]"
        >
          ↗
        </span>

        {/* самолётик (сцена plane) */}
        {link.scene === "plane" && (
          <svg
            ref={planeRef}
            aria-hidden
            viewBox="0 0 24 24"
            className="pointer-events-none absolute right-4 top-1/2 h-6 w-6 -translate-y-1/2 opacity-0"
          >
            <path d="M2 21 L23 12 L2 3 L6 12 Z" fill="var(--color-signal-ink)" />
          </svg>
        )}
        {/* штемпель SLK (сцена envelope) */}
        {link.scene === "envelope" && (
          <span
            ref={stampRef}
            aria-hidden
            className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 rounded-sm border-2 border-signal-ink px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-label text-signal-ink opacity-0"
          >
            SLK
          </span>
        )}
      </a>

      {toast && (
        <div
          role="status"
          className="instrument-panel fixed bottom-6 left-1/2 z-[85] -translate-x-1/2 rounded-sm px-4 py-2 text-[13px]"
        >
          В буфере: {link.value}
        </div>
      )}

      {concierge && link.scene === "concierge" && (
        <ConciergeLazy onClose={() => setConcierge(false)} />
      )}
    </>
  );
}
