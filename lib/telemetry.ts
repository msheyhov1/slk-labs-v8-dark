"use client";

// Настоящая телеметрия посетителя — никаких нарисованных цифр.
// Всё читается локально из браузерных API с graceful fallback.

export type Telemetry = {
  gpu: string | null;
  cores: number | null;
  memoryGb: number | null;
  network: string | null; // effectiveType: 4g / 3g / …
  transferKb: number | null; // вес навигационного документа
  ttfbMs: number | null;
  lcpMs: number | null;
  dpr: number;
  viewport: { w: number; h: number };
};

/** GPU-строка через WEBGL_debug_renderer_info (не фингерпринт — не отправляется). */
export function readGpu(): string | null {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null);
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const raw = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    // "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified)" → "Apple M2 Pro"
    const angle = raw.match(/ANGLE \([^,]+,\s*([^,)]+)/i);
    let m = (angle?.[1] ?? raw).trim();
    // остатки обвязки драйвера: "ANGLE Metal Renderer: Apple M5" → "Apple M5"
    if (m.includes(":")) m = m.slice(m.lastIndexOf(":") + 1).trim();
    m = m.replace(/\s*(Renderer|GPU)\s*$/i, "").trim();
    return m || null;
  } catch {
    return null;
  }
}

export function readStatic(): Pick<Telemetry, "cores" | "memoryGb" | "network" | "dpr" | "viewport"> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string };
  };
  return {
    cores: nav.hardwareConcurrency ?? null,
    memoryGb: nav.deviceMemory ?? null,
    network: nav.connection?.effectiveType ?? null,
    dpr: Math.min(window.devicePixelRatio || 1, 3),
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}

export function readNavigationPerf(): Pick<Telemetry, "transferKb" | "ttfbMs"> {
  try {
    const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (!nav) return { transferKb: null, ttfbMs: null };
    return {
      transferKb: nav.transferSize ? Math.round(nav.transferSize / 1024) : null,
      ttfbMs: nav.responseStart ? Math.round(nav.responseStart) : null,
    };
  } catch {
    return { transferKb: null, ttfbMs: null };
  }
}

/** LCP через PerformanceObserver. По спецификации LCP финализируется первым
 *  вводом пользователя — замораживаем наблюдение на первом взаимодействии,
 *  иначе поздние перерисовки читаются как «LCP 15s» и врут. */
export function observeLcp(onLcp: (ms: number) => void): () => void {
  try {
    const po = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) onLcp(Math.round(last.startTime));
    });
    po.observe({ type: "largest-contentful-paint", buffered: true });
    const stop = () => po.disconnect();
    const opts = { once: true, passive: true } as const;
    window.addEventListener("pointerdown", stop, opts);
    window.addEventListener("keydown", stop, opts);
    window.addEventListener("wheel", stop, opts);
    return () => {
      po.disconnect();
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("wheel", stop);
    };
  } catch {
    return () => {};
  }
}

/** rAF-счётчик FPS: скользящее окно за ~500 мс. */
export function startFpsMeter(onFps: (fps: number) => void): () => void {
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let frames = 0;
  const tick = (now: number) => {
    acc += now - last;
    last = now;
    frames++;
    if (acc >= 500) {
      onFps(Math.round((frames * 1000) / acc));
      acc = 0;
      frames = 0;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
