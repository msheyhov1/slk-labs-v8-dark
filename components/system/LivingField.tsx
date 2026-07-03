"use client";

import { useEffect, useRef } from "react";
import { prefersReduced } from "@/lib/gsap";
import { makeEnsoSeed } from "@/lib/seed";
import { readGpu } from "@/lib/telemetry";
import { registerField } from "@/lib/field-store";
import { LivingFieldEngine } from "./engine/field";

/**
 * Живое поле героя (v7): сеть узлов-связей дышит и тянется к курсору.
 * Canvas абсолютный внутри секции — IntersectionObserver честно паузит
 * сцену за пределами вьюпорта. pointer-events:none — скролл и клики
 * свободны, курсор движок слушает на window.
 */
export function LivingField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    let engine: LivingFieldEngine | null = null;
    try {
      engine = new LivingFieldEngine(canvas, makeEnsoSeed(readGpu()), prefersReduced());
    } catch {
      // WebGL2 недоступен — герой остаётся типографским (прогрессивное улучшение)
      return;
    }

    registerField(engine);
    return () => {
      registerField(null);
      engine?.dispose();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
    />
  );
}
