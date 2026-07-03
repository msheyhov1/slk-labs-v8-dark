// Живое поле v8 — чистый WebGL2, без three (бюджет JS).
// Сеть узлов-связей (тушь по бумаге) + красные «пакеты» по линиям +
// сборка энсо: на загрузке сеть стягивается к окружности и «кисть»
// прорисовывает знак в offscreen-растр (давление, рваный край, брызги),
// затем узлы отпускаются в фоновый дрейф. Seed → уникальный оттиск.
//
// Перф-дисциплина: собственный аккумулятор времени (не wall-clock),
// пауза на hidden/blur, авто-даунгрейд по первому замеру FPS.

import { mulberry32 } from "@/lib/seed";

const INK = [0.855, 0.839, 0.8] as const; // костяной свет узлов/линий (v7)
const RED = [0, 0.878, 0.541] as const; // сигнальный зелёный: пакеты/энсо = свет (v7)

const CFG = {
  densityDivisor: 26000, // px² на узел
  maxNodes: 96,
  maxNodesMobile: 52,
  minNodes: 28,
  linkDist: 0.16, // × min(w,h)
  drift: 0.012, // амплитуда дрейфа (× min(w,h))
  pointerR: 0.22, // радиус тяги курсора
  pointerPull: 0.35,
  packetEvery: [0.7, 1.6] as const, // сек между пакетами (случайно)
  packetLife: 0.55,
  assembleDur: 1.4, // = --dur-hero
  releaseDur: 0.9,
  lowFps: 45,
};

type Node = {
  hx: number; hy: number; // дом (доля вьюпорта)
  x: number; y: number;
  ph: number; // фаза дрейфа
  sz: number;
  // сборка энсо: цель на дуге (s-параметр) либо -1
  s: number;
};

type Packet = { a: number; b: number; t: number };

export type FieldHooks = {
  onEnsoDone?: () => void;
  onDowngrade?: () => void;
};

export class LivingFieldEngine {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private dpr: number;
  private w = 0;
  private h = 0;

  private nodes: Node[] = [];
  private packets: Packet[] = [];
  private links: Array<[number, number]> = [];
  private nextPacket = 1;

  private rand: () => number;
  private reduced: boolean;
  private hooks: FieldHooks;

  // время: собственный аккумулятор — не сбрасывается паузами
  private t = 0;
  private raf = 0;
  private running = false;
  private last = 0;

  // сборка энсо
  private phase: "assemble" | "release" | "ambient" = "assemble";
  private phaseT = 0;
  private ensoCx = 0.68; // композиция: оттиск правее центра
  private ensoCy = 0.44;
  private ensoR = 0.26; // × min(w,h)
  private ensoA0: number;
  private ensoSweep: number;
  private brushS = 0; // прорисовано до s
  private raster: HTMLCanvasElement;
  private rctx: CanvasRenderingContext2D;
  private rasterDirty = false;

  // GL
  private ptsProg!: WebGLProgram;
  private linProg!: WebGLProgram;
  private texProg!: WebGLProgram;
  private ptsBuf!: WebGLBuffer;
  private linBuf!: WebGLBuffer;
  private quadBuf!: WebGLBuffer;
  private tex!: WebGLTexture;
  private ptsArr = new Float32Array(0);
  private linArr = new Float32Array(0);

  // перф
  private frames = 0;
  private fpsAcc = 0;
  private degraded = false;

  private pointer = { x: 0, y: 0, active: false };
  private disposed = false;
  private cleanupFns: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, seed: number, reduced: boolean, hooks: FieldHooks = {}) {
    this.canvas = canvas;
    this.reduced = reduced;
    this.hooks = hooks;
    this.rand = mulberry32(seed);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    const gl = canvas.getContext("webgl2", { alpha: true, antialias: true });
    if (!gl) throw new Error("webgl2-unavailable");
    this.gl = gl;

    // seed → характер оттиска: где разрыв, сколько дуги, лёгкий наклон
    this.ensoA0 = -Math.PI / 2 + (this.rand() - 0.5) * 0.9;
    this.ensoSweep = Math.PI * (1.82 + this.rand() * 0.12); // всегда с разрывом

    this.raster = document.createElement("canvas");
    this.rctx = this.raster.getContext("2d")!;

    this.initGl();
    this.resize();
    this.seedNodes();

    const onResize = () => this.resize();
    window.addEventListener("resize", onResize);
    this.cleanupFns.push(() => window.removeEventListener("resize", onResize));

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.pointer = {
        x: (e.clientX - r.left) / Math.max(1, r.width),
        y: (e.clientY - r.top) / Math.max(1, r.height),
        active:
          e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom &&
          window.matchMedia("(hover: hover)").matches,
      };
    };
    const onDown = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      this.burst();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    this.cleanupFns.push(() => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    });

    // пауза: скрытая вкладка / потеря фокуса / герой вне вьюпорта
    const pause = () => this.stop();
    const resume = () => this.start();
    const onVis = () => (document.hidden ? pause() : resume());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
    this.cleanupFns.push(() => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);
    });
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? resume() : pause()),
      { threshold: 0.02 },
    );
    io.observe(canvas);
    this.cleanupFns.push(() => io.disconnect());

    if (reduced) {
      // статика: энсо уже нарисован, сеть замерла — один кадр
      this.stampRange(0, 1);
      this.phase = "ambient";
      this.brushS = 1;
      hooks.onEnsoDone?.();
      this.renderOnce();
    } else {
      this.start();
    }
  }

  // ---------- публичное ----------

  /** Пересобрать оттиск с новым зерном (терминал: enso --reseed). */
  reseed(seed: number) {
    this.rand = mulberry32(seed);
    this.ensoA0 = -Math.PI / 2 + (this.rand() - 0.5) * 0.9;
    this.ensoSweep = Math.PI * (1.82 + this.rand() * 0.12);
    this.rctx.clearRect(0, 0, this.raster.width, this.raster.height);
    this.rasterDirty = true;
    this.brushS = 0;
    this.phase = "assemble";
    this.phaseT = 0;
    this.assignEnsoTargets();
    if (this.reduced) {
      this.stampRange(0, 1);
      this.brushS = 1;
      this.phase = "ambient";
      this.renderOnce();
    } else {
      this.start();
    }
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.cleanupFns.forEach((f) => f());
    const gl = this.gl;
    gl.deleteBuffer(this.ptsBuf);
    gl.deleteBuffer(this.linBuf);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteTexture(this.tex);
    gl.deleteProgram(this.ptsProg);
    gl.deleteProgram(this.linProg);
    gl.deleteProgram(this.texProg);
  }

  // ---------- инициализация ----------

  private initGl() {
    const gl = this.gl;
    const vsPts = `#version 300 es
      in vec2 aPos; in float aSize; in float aAlpha; in float aHeat;
      out float vAlpha; out float vHeat;
      void main() {
        vAlpha = aAlpha; vHeat = aHeat;
        gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
        gl_Position.y = -gl_Position.y;
        gl_PointSize = aSize;
      }`;
    const fsPts = `#version 300 es
      precision mediump float;
      in float vAlpha; in float vHeat; out vec4 o;
      uniform vec3 uInk; uniform vec3 uRed;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        float soft = smoothstep(1.0, 0.55, d);
        vec3 c = mix(uInk, uRed, vHeat);
        o = vec4(c, soft * vAlpha);
      }`;
    const vsLin = `#version 300 es
      in vec2 aPos; in float aAlpha; in float aHeat;
      out float vAlpha; out float vHeat;
      void main() {
        vAlpha = aAlpha; vHeat = aHeat;
        gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
        gl_Position.y = -gl_Position.y;
      }`;
    const fsLin = `#version 300 es
      precision mediump float;
      in float vAlpha; in float vHeat; out vec4 o;
      uniform vec3 uInk; uniform vec3 uRed;
      void main() { o = vec4(mix(uInk, uRed, vHeat), vAlpha); }`;
    const vsTex = `#version 300 es
      in vec2 aPos; out vec2 vUv;
      void main() {
        vUv = aPos;
        gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
        gl_Position.y = -gl_Position.y;
      }`;
    const fsTex = `#version 300 es
      precision mediump float;
      in vec2 vUv; out vec4 o; uniform sampler2D uTex;
      void main() { o = texture(uTex, vUv); }`;

    this.ptsProg = this.program(vsPts, fsPts);
    this.linProg = this.program(vsLin, fsLin);
    this.texProg = this.program(vsTex, fsTex);

    this.ptsBuf = gl.createBuffer()!;
    this.linBuf = gl.createBuffer()!;
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }

  private program(vsSrc: string, fsSrc: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`);
      }
      return sh;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
    }
    return p;
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // растр энсо: тот же размер (в device px), перерисовываем накопленный штрих
    this.raster.width = this.canvas.width;
    this.raster.height = this.canvas.height;
    if (this.brushS > 0) {
      this.stampRange(0, this.brushS);
    }
    this.rasterDirty = true;
    if (this.reduced) this.renderOnce();
  }

  private seedNodes() {
    const mobile = this.w < 720;
    const cap = mobile ? CFG.maxNodesMobile : CFG.maxNodes;
    const n = Math.max(CFG.minNodes, Math.min(cap, Math.round((this.w * this.h) / CFG.densityDivisor)));
    this.nodes = [];
    for (let i = 0; i < n; i++) {
      const hx = this.rand();
      const hy = this.rand();
      this.nodes.push({
        hx, hy, x: hx, y: hy,
        ph: this.rand() * Math.PI * 2,
        sz: (1.6 + this.rand() * 2.2) * this.dpr,
        s: -1,
      });
    }
    this.assignEnsoTargets();
    this.ptsArr = new Float32Array(n * 5);
  }

  /** Каждому узлу — точка дуги (равномерно + джиттер): сеть соберёт знак. */
  private assignEnsoTargets() {
    const n = this.nodes.length;
    for (let i = 0; i < n; i++) {
      this.nodes[i].s = (i / n + this.rand() * 0.5 / n) % 1;
    }
  }

  private ensoPoint(s: number): { x: number; y: number } {
    const a = this.ensoA0 + s * this.ensoSweep;
    const m = Math.min(this.w, this.h);
    const rr = this.ensoR * m * (1 + (this.rand() - 0.5) * 0); // радиус стабилен; дрожь — в кисти
    return {
      x: this.ensoCx * this.w + Math.cos(a) * rr,
      y: this.ensoCy * this.h + Math.sin(a) * rr,
    };
  }

  // ---------- кисть ----------

  /** Прорисовать штрих на растре в диапазоне s: [from → to]. */
  private stampRange(from: number, to: number) {
    const ctx = this.rctx;
    const m = Math.min(this.w, this.h) * this.dpr;
    const cx = this.ensoCx * this.w * this.dpr;
    const cy = this.ensoCy * this.h * this.dpr;
    const R = this.ensoR * (Math.min(this.w, this.h)) * this.dpr;
    const base = Math.max(4, R * 0.085); // толщина кисти
    const step = Math.max(0.0012, 0.35 / (R * Math.PI * 2 / m + 1) * 0.01);

    ctx.fillStyle = `rgb(${Math.round(RED[0] * 255)} ${Math.round(RED[1] * 255)} ${Math.round(RED[2] * 255)})`;

    for (let s = from; s <= to; s += step) {
      const a = this.ensoA0 + s * this.ensoSweep;
      // давление: вход тонко → полнота → срыв на выходе (рваный хвост)
      const press = Math.pow(Math.sin(Math.min(s, 1) * Math.PI), 0.55);
      const tail = s > 0.9 ? 1 - (s - 0.9) * 6 * this.rand() * 0.5 : 1;
      const rr = R + (this.rand() - 0.5) * base * 0.5; // дрожь руки
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      const w = base * (0.35 + press * 0.85) * Math.max(0.15, tail);

      ctx.globalAlpha = 0.16 + press * 0.2;
      ctx.beginPath();
      ctx.arc(x, y, w, 0, Math.PI * 2);
      ctx.fill();

      // рваный край: сателлиты поперёк штриха
      if (this.rand() < 0.5) {
        const na = a + Math.PI / 2;
        const off = (this.rand() - 0.5) * w * 2.4;
        ctx.globalAlpha = 0.1 + this.rand() * 0.12;
        ctx.beginPath();
        ctx.arc(x + Math.cos(na) * off, y + Math.sin(na) * off, w * (0.2 + this.rand() * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
      // брызги — редкие, у полного давления
      if (press > 0.6 && this.rand() < 0.02) {
        const sa = this.rand() * Math.PI * 2;
        const sd = w * (2 + this.rand() * 4);
        ctx.globalAlpha = 0.25 + this.rand() * 0.3;
        ctx.beginPath();
        ctx.arc(x + Math.cos(sa) * sd, y + Math.sin(sa) * sd, w * 0.12 * (1 + this.rand()), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    this.rasterDirty = true;
  }

  // ---------- пакеты ----------

  private burst() {
    for (let k = 0; k < 3 && this.links.length; k++) {
      const li = Math.floor(this.rand() * this.links.length);
      this.packets.push({ a: this.links[li][0], b: this.links[li][1], t: 0 });
    }
  }

  // ---------- цикл ----------

  private start() {
    if (this.running || this.disposed || this.reduced) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 1 / 30);
      this.last = now;
      this.t += dt;
      this.stepAndRender(dt);
      this.measure(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private measure(dt: number) {
    if (this.degraded || this.phase === "assemble") return;
    this.frames++;
    this.fpsAcc += dt;
    if (this.frames >= 120) {
      const fps = this.frames / this.fpsAcc;
      if (fps < CFG.lowFps) {
        // авто-даунгрейд слабого GPU: меньше узлов, реже пакеты
        this.nodes.length = Math.max(CFG.minNodes, Math.floor(this.nodes.length * 0.6));
        this.degraded = true;
        this.hooks.onDowngrade?.();
      }
      this.frames = 0;
      this.fpsAcc = 0;
    }
  }

  private stepAndRender(dt: number) {
    const { nodes } = this;
    const m = Math.min(this.w, this.h);
    this.phaseT += dt;

    // фазовая логика
    if (this.phase === "assemble") {
      const k = Math.min(1, this.phaseT / CFG.assembleDur);
      const eased = 1 - Math.pow(1 - k, 3);
      if (eased > this.brushS) {
        this.stampRange(this.brushS, eased);
        this.brushS = eased;
      }
      if (k >= 1) {
        this.phase = "release";
        this.phaseT = 0;
        this.hooks.onEnsoDone?.();
      }
    } else if (this.phase === "release" && this.phaseT > CFG.releaseDur) {
      this.phase = "ambient";
    }

    // движение узлов
    const assembleK =
      this.phase === "assemble"
        ? Math.min(1, this.phaseT / (CFG.assembleDur * 0.55))
        : this.phase === "release"
          ? 1 - Math.min(1, this.phaseT / CFG.releaseDur)
          : 0;

    for (const nd of nodes) {
      // фоновый дрейф вокруг дома
      const dx = Math.sin(this.t * 0.4 + nd.ph) * CFG.drift;
      const dy = Math.cos(this.t * 0.33 + nd.ph * 1.3) * CFG.drift;
      let tx = nd.hx + (dx * m) / this.w;
      let ty = nd.hy + (dy * m) / this.h;

      // сборка: узел стремится к своей точке дуги (только пока штрих не прошёл)
      if (assembleK > 0 && nd.s >= 0) {
        const lead = this.phase === "assemble" && nd.s > this.brushS - 0.06;
        const pull = lead ? assembleK : assembleK * 0.35;
        const p = this.ensoPoint(nd.s);
        tx = tx + (p.x / this.w - tx) * pull;
        ty = ty + (p.y / this.h - ty) * pull;
      }

      // тяга курсора (ambient)
      if (this.pointer.active && this.phase === "ambient") {
        const px = this.pointer.x;
        const py = this.pointer.y;
        const ddx = (px - nd.x) * this.w;
        const ddy = (py - nd.y) * this.h;
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        const R = CFG.pointerR * m;
        if (d < R && d > 1) {
          const f = (1 - d / R) * CFG.pointerPull * dt;
          tx += (ddx / d) * f * (m / this.w) * 60 * 0.01;
          ty += (ddy / d) * f * (m / this.h) * 60 * 0.01;
        }
      }

      nd.x += (tx - nd.x) * Math.min(1, dt * 3.2);
      nd.y += (ty - nd.y) * Math.min(1, dt * 3.2);
    }

    // связи по дистанции
    this.links.length = 0;
    const maxD = CFG.linkDist * m;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const ddx = (nodes[i].x - nodes[j].x) * this.w;
        const ddy = (nodes[i].y - nodes[j].y) * this.h;
        if (ddx * ddx + ddy * ddy < maxD * maxD) this.links.push([i, j]);
      }
    }

    // пакеты: живой поток по связям
    this.nextPacket -= dt;
    if (this.nextPacket <= 0 && this.links.length && this.phase === "ambient") {
      const li = Math.floor(this.rand() * this.links.length);
      this.packets.push({ a: this.links[li][0], b: this.links[li][1], t: 0 });
      const [lo, hi] = CFG.packetEvery;
      this.nextPacket = lo + this.rand() * (hi - lo) * (this.degraded ? 2 : 1);
    }
    for (let i = this.packets.length - 1; i >= 0; i--) {
      this.packets[i].t += dt / CFG.packetLife;
      if (this.packets[i].t >= 1) this.packets.splice(i, 1);
    }

    this.render();
  }

  private renderOnce() {
    // единственный кадр для reduced-motion / resize в статике
    this.links.length = 0;
    const m = Math.min(this.w, this.h);
    const maxD = CFG.linkDist * m;
    const nodes = this.nodes;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const ddx = (nodes[i].x - nodes[j].x) * this.w;
        const ddy = (nodes[i].y - nodes[j].y) * this.h;
        if (ddx * ddx + ddy * ddy < maxD * maxD) this.links.push([i, j]);
      }
    }
    this.render();
  }

  private render() {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);

    // — линии —
    const L = this.links.length;
    const need = L * 2 * 4 + this.packets.length * 2 * 4;
    if (this.linArr.length < need) this.linArr = new Float32Array(need * 2);
    let o = 0;
    const m = Math.min(this.w, this.h);
    const maxD = CFG.linkDist * m;
    for (const [i, j] of this.links) {
      const a = this.nodes[i];
      const b = this.nodes[j];
      const ddx = (a.x - b.x) * this.w;
      const ddy = (a.y - b.y) * this.h;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      const al = (1 - d / maxD) * 0.22;
      this.linArr[o++] = a.x; this.linArr[o++] = a.y; this.linArr[o++] = al; this.linArr[o++] = 0;
      this.linArr[o++] = b.x; this.linArr[o++] = b.y; this.linArr[o++] = al; this.linArr[o++] = 0;
    }
    // пакеты: короткий красный сегмент, бегущий по линии
    for (const p of this.packets) {
      const a = this.nodes[p.a];
      const b = this.nodes[p.b];
      if (!a || !b) continue;
      const t0 = Math.max(0, p.t - 0.12);
      const x0 = a.x + (b.x - a.x) * t0;
      const y0 = a.y + (b.y - a.y) * t0;
      const x1 = a.x + (b.x - a.x) * p.t;
      const y1 = a.y + (b.y - a.y) * p.t;
      const al = Math.sin(p.t * Math.PI) * 0.9;
      this.linArr[o++] = x0; this.linArr[o++] = y0; this.linArr[o++] = al; this.linArr[o++] = 1;
      this.linArr[o++] = x1; this.linArr[o++] = y1; this.linArr[o++] = al; this.linArr[o++] = 1;
    }
    const lineVerts = o / 4;
    gl.useProgram(this.linProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.linBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.linArr.subarray(0, o), gl.DYNAMIC_DRAW);
    this.attrib(this.linProg, "aPos", 2, 16, 0);
    this.attrib(this.linProg, "aAlpha", 1, 16, 8);
    this.attrib(this.linProg, "aHeat", 1, 16, 12);
    this.uniform3(this.linProg, "uInk", INK);
    this.uniform3(this.linProg, "uRed", RED);
    gl.drawArrays(gl.LINES, 0, lineVerts);

    // — узлы —
    const n = this.nodes.length;
    if (this.ptsArr.length < n * 5) this.ptsArr = new Float32Array(n * 5);
    let q = 0;
    for (const nd of this.nodes) {
      this.ptsArr[q++] = nd.x;
      this.ptsArr[q++] = nd.y;
      this.ptsArr[q++] = nd.sz;
      this.ptsArr[q++] = 0.6;
      this.ptsArr[q++] = 0;
    }
    gl.useProgram(this.ptsProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.ptsArr.subarray(0, q), gl.DYNAMIC_DRAW);
    this.attrib(this.ptsProg, "aPos", 2, 20, 0);
    this.attrib(this.ptsProg, "aSize", 1, 20, 8);
    this.attrib(this.ptsProg, "aAlpha", 1, 20, 12);
    this.attrib(this.ptsProg, "aHeat", 1, 20, 16);
    this.uniform3(this.ptsProg, "uInk", INK);
    this.uniform3(this.ptsProg, "uRed", RED);
    gl.drawArrays(gl.POINTS, 0, n);

    // — растр энсо поверх —
    if (this.brushS > 0) {
      if (this.rasterDirty) {
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.raster);
        this.rasterDirty = false;
      }
      gl.useProgram(this.texProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      this.attrib(this.texProg, "aPos", 2, 8, 0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  private attrib(prog: WebGLProgram, name: string, size: number, stride: number, offset: number) {
    const gl = this.gl;
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  }

  private uniform3(prog: WebGLProgram, name: string, v: readonly [number, number, number]) {
    const gl = this.gl;
    gl.uniform3f(gl.getUniformLocation(prog, name), v[0], v[1], v[2]);
  }
}
