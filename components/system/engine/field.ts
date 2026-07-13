// Живое поле v8-dark — чистый WebGL2, без three (бюджет JS).
// «Нейро-мозг» Dala: облако частиц-огоньков в форме мозга — настоящее 3D
// (медленное вращение, дыхание, глубина), связи-синапсы между соседями и
// импульсы света, бегущие по ним ЦЕПОЧКАМИ — нейронные вспышки.
// Спектр Dala: фиолет / синий / бирюза / магента / янтарь.
// Плюс редкие ambient-частицы, дрейфующие по всему полю.
//
// Перф-дисциплина: связи считаются ОДИН раз при посеве (k-ближайших в 3D),
// per-frame — только O(n) проекция; пауза на hidden/blur/вне вьюпорта,
// авто-даунгрейд по замеру FPS. `reseed` пересобирает облако (терминал).

import { mulberry32 } from "@/lib/seed";

// Спектр Dala (частицы = свет; аддитивное смешение на чёрном)
const PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0.545, 0.361, 1.0],   // фиолет  #8B5CFF
  [0.31, 0.553, 1.0],    // синий   #4F8DFF
  [0.184, 0.851, 0.659], // бирюза  #2FD9A8
  [1.0, 0.353, 0.82],    // магента #FF5AD1
  [1.0, 0.722, 0.302],   // янтарь  #FFB84D
];
const PALETTE_W = [0.34, 0.22, 0.16, 0.14, 0.14] as const;

const CFG = {
  brainDivisor: 1500, // px² на частицу мозга
  maxBrain: 880,
  maxBrainMobile: 420,
  minBrain: 240,
  ambientRatio: 0.15, // доля ambient-частиц от мозга
  kNear: 2, // связей на частицу (k-ближайших)
  maxLink3d: 0.26, // предел длины связи (3D-юниты мозга)
  yawSpeed: 0.12, // рад/с — медленное вращение
  pitchAmp: 0.07, // качание по тангажу
  breathAmp: 0.018, // «дыхание» масштаба
  pointerR: 0.2, // радиус влияния курсора (× min(w,h))
  packetEvery: [0.3, 0.75] as const, // сек между импульсами
  packetLife: 0.42, // сек на пролёт импульса по связи
  chainP: 0.55, // вероятность продолжить цепочку в следующем синапсе
  maxPackets: 22,
  lowFps: 45,
};

type Packet = { a: number; b: number; t: number };

export type FieldHooks = {
  onDowngrade?: () => void;
};

export class LivingFieldEngine {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private dpr: number;
  private w = 0;
  private h = 0;

  // — мозг (SoA) —
  private n = 0; // частиц мозга
  private home = new Float32Array(0); // x,y,z дома (объектное пространство)
  private target = new Float32Array(0); // цель миграции при reseed
  private ph = new Float32Array(0); // фаза мерцания
  private sz = new Float32Array(0);
  private al = new Float32Array(0);
  private col = new Float32Array(0); // r,g,b
  private proj = new Float32Array(0); // px,py,depth (пересчёт каждый кадр)
  private off = new Float32Array(0); // ox,oy — смещение от курсора (px)

  // — связи-синапсы (посев один раз) —
  private links: number[] = []; // пары [a,b] подряд
  private linkAl: number[] = []; // базовая яркость связи
  private adj: number[][] = []; // смежность для цепочек импульсов

  // — ambient-частицы (2D по всему полю) —
  private an = 0;
  private aHome = new Float32Array(0); // x,y (доли вьюпорта)
  private aPh = new Float32Array(0);
  private aSz = new Float32Array(0);
  private aAl = new Float32Array(0);
  private aCol = new Float32Array(0);

  private packets: Packet[] = [];
  private nextPacket = 0.8;

  private rand: () => number;
  private reduced: boolean;
  private hooks: FieldHooks;

  // время: собственный аккумулятор — не сбрасывается паузами
  private t = 0;
  private raf = 0;
  private running = false;
  private last = 0;

  // GL
  private ptsProg!: WebGLProgram;
  private linProg!: WebGLProgram;
  private ptsBuf!: WebGLBuffer;
  private linBuf!: WebGLBuffer;
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

    // фон секции — чистый чёрный void: непрозрачный канвас + аддитивный свет
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
    if (!gl) throw new Error("webgl2-unavailable");
    this.gl = gl;

    this.initGl();
    this.resize();
    this.seedAll();

    const onResize = () => this.resize();
    window.addEventListener("resize", onResize);
    this.cleanupFns.push(() => window.removeEventListener("resize", onResize));

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.pointer = {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
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

    // пауза: скрытая вкладка / потеря фокуса / поле вне вьюпорта
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
      // статика: мозг замер в красивом ракурсе — один кадр
      this.t = 0.6;
      this.renderFrame(0);
    } else {
      this.start();
    }
  }

  // ---------- публичное ----------

  /** Пересобрать облако (терминал: enso --reseed): новые дома частиц,
   *  существующие плавно мигрируют + всплеск импульсов. */
  reseed(seed: number) {
    this.rand = mulberry32(seed);
    for (let i = 0; i < this.n; i++) {
      const p = this.sampleBrainPoint();
      this.target[i * 3] = p[0];
      this.target[i * 3 + 1] = p[1];
      this.target[i * 3 + 2] = p[2];
    }
    this.buildLinks(this.target);
    this.burst();
    if (this.reduced) {
      this.home.set(this.target);
      this.renderFrame(0);
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
    gl.deleteProgram(this.ptsProg);
    gl.deleteProgram(this.linProg);
  }

  // ---------- инициализация ----------

  private initGl() {
    const gl = this.gl;
    const vsPts = `#version 300 es
      in vec2 aPos; in float aSize; in float aAlpha; in vec3 aColor;
      out float vAlpha; out vec3 vColor;
      uniform vec2 uRes;
      void main() {
        vAlpha = aAlpha; vColor = aColor;
        vec2 clip = (aPos / uRes) * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
        gl_PointSize = aSize;
      }`;
    // Частица-огонёк: горячее ядро + мягкое свечение (аддитивно на чёрном)
    const fsPts = `#version 300 es
      precision mediump float;
      in float vAlpha; in vec3 vColor; out vec4 o;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        float core = smoothstep(0.32, 0.0, d);
        float halo = smoothstep(1.0, 0.2, d);
        float a = (core * 0.85 + halo * 0.5) * vAlpha;
        o = vec4(vColor * (0.8 + 0.6 * core), a);
      }`;
    const vsLin = `#version 300 es
      in vec2 aPos; in float aAlpha; in vec3 aColor;
      out float vAlpha; out vec3 vColor;
      uniform vec2 uRes;
      void main() {
        vAlpha = aAlpha; vColor = aColor;
        vec2 clip = (aPos / uRes) * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      }`;
    const fsLin = `#version 300 es
      precision mediump float;
      in float vAlpha; in vec3 vColor; out vec4 o;
      void main() { o = vec4(vColor, vAlpha); }`;

    this.ptsProg = this.program(vsPts, fsPts);
    this.linProg = this.program(vsLin, fsLin);
    this.ptsBuf = gl.createBuffer()!;
    this.linBuf = gl.createBuffer()!;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // свет складывается — glow без пост-эффектов
    gl.clearColor(0, 0, 0, 1);
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
    if (this.reduced) this.renderFrame(0);
  }

  // ---------- форма мозга (3D) ----------

  /** Внутри ли точка «мозга» (вид сбоку, лоб влево): большой мозг +
   *  мозжечок снизу-сзади + ствол; продольная щель сверху — деталь формы. */
  private insideBrain(x: number, y: number, z: number): boolean {
    const inCerebrum =
      (x * x) / 1.0 + (y * y) / (0.74 * 0.74) + (z * z) / (0.7 * 0.7) <= 1 &&
      !(y > 0.34 && x > 0.1); // срез снизу-сзади — место мозжечка
    const cx = x - 0.5, cy = y - 0.44;
    const inCereb =
      (cx * cx) / (0.34 * 0.34) + (cy * cy) / (0.24 * 0.24) + (z * z) / (0.4 * 0.4) <= 1;
    const sx = x - 0.16, sy = y - 0.62;
    const inStem =
      (sx * sx) / (0.13 * 0.13) + (sy * sy) / (0.24 * 0.24) + (z * z) / (0.13 * 0.13) <= 1;
    // продольная щель между полушариями (видна при вращении)
    const fissure = Math.abs(z) < 0.045 && y < -0.12 && inCerebrum;
    return (inCerebrum || inCereb || inStem) && !fissure;
  }

  /** Случайная точка внутри мозга; ~55% — у поверхности (кора светится). */
  private sampleBrainPoint(): [number, number, number] {
    const shell = this.rand() < 0.55;
    for (let tries = 0; tries < 60; tries++) {
      const x = (this.rand() * 2 - 1) * 1.15;
      const y = (this.rand() * 2 - 1) * 1.0;
      const z = (this.rand() * 2 - 1) * 0.85;
      if (!this.insideBrain(x, y, z)) continue;
      if (shell && this.insideBrain(x / 0.84, y / 0.84, z / 0.84)) continue; // не «кора» — глубже
      return [x, y, z];
    }
    return [0, 0, 0];
  }

  private pickColor(dst: Float32Array, at: number) {
    let r = this.rand();
    let idx = 0;
    for (let i = 0; i < PALETTE_W.length; i++) {
      if (r < PALETTE_W[i]) { idx = i; break; }
      r -= PALETTE_W[i];
      idx = i;
    }
    const c = PALETTE[idx];
    dst[at] = c[0]; dst[at + 1] = c[1]; dst[at + 2] = c[2];
  }

  private seedAll() {
    const mobile = this.w < 720;
    const cap = mobile ? CFG.maxBrainMobile : CFG.maxBrain;
    this.n = Math.max(CFG.minBrain, Math.min(cap, Math.round((this.w * this.h) / CFG.brainDivisor)));

    this.home = new Float32Array(this.n * 3);
    this.target = new Float32Array(this.n * 3);
    this.ph = new Float32Array(this.n);
    this.sz = new Float32Array(this.n);
    this.al = new Float32Array(this.n);
    this.col = new Float32Array(this.n * 3);
    this.proj = new Float32Array(this.n * 3);
    this.off = new Float32Array(this.n * 2);

    for (let i = 0; i < this.n; i++) {
      const p = this.sampleBrainPoint();
      this.home[i * 3] = p[0];
      this.home[i * 3 + 1] = p[1];
      this.home[i * 3 + 2] = p[2];
      this.ph[i] = this.rand() * Math.PI * 2;
      this.sz[i] = (2.6 + this.rand() * 3.4) * this.dpr;
      this.al[i] = 0.62 + this.rand() * 0.38;
      this.pickColor(this.col, i * 3);
    }
    this.target.set(this.home);
    this.buildLinks(this.home);

    // ambient: редкие огоньки по всему полю (атмосферная глубина)
    this.an = Math.round(this.n * CFG.ambientRatio);
    this.aHome = new Float32Array(this.an * 2);
    this.aPh = new Float32Array(this.an);
    this.aSz = new Float32Array(this.an);
    this.aAl = new Float32Array(this.an);
    this.aCol = new Float32Array(this.an * 3);
    for (let i = 0; i < this.an; i++) {
      this.aHome[i * 2] = this.rand();
      this.aHome[i * 2 + 1] = this.rand();
      this.aPh[i] = this.rand() * Math.PI * 2;
      this.aSz[i] = (1.5 + this.rand() * 1.6) * this.dpr;
      this.aAl[i] = 0.16 + this.rand() * 0.3;
      this.pickColor(this.aCol, i * 3);
    }

    this.ptsArr = new Float32Array((this.n + this.an) * 7);
  }

  /** Синапсы: k-ближайших соседей в 3D. Считается один раз (O(n²) на посев,
   *  зато per-frame — ничего). */
  private buildLinks(pts: Float32Array) {
    const n = this.n;
    this.links.length = 0;
    this.linkAl.length = 0;
    this.adj = Array.from({ length: n }, () => []);
    const seen = new Set<number>();
    const maxD2 = CFG.maxLink3d * CFG.maxLink3d;

    for (let i = 0; i < n; i++) {
      let b1 = -1, b2 = -1, d1 = Infinity, d2 = Infinity;
      const ix = pts[i * 3], iy = pts[i * 3 + 1], iz = pts[i * 3 + 2];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = ix - pts[j * 3];
        const dy = iy - pts[j * 3 + 1];
        const dz = iz - pts[j * 3 + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = j; }
        else if (d < d2) { d2 = d; b2 = j; }
      }
      const cand = CFG.kNear >= 2 ? [b1, b2] : [b1];
      const dist = [d1, d2];
      for (let k = 0; k < cand.length; k++) {
        const j = cand[k];
        if (j < 0 || dist[k] > maxD2) continue;
        const key = i < j ? i * 65536 + j : j * 65536 + i;
        if (seen.has(key)) continue;
        seen.add(key);
        this.links.push(i, j);
        this.linkAl.push(0.14 + this.rand() * 0.1);
        this.adj[i].push(j);
        this.adj[j].push(i);
      }
    }

    const L = this.links.length / 2;
    this.linArr = new Float32Array((L + CFG.maxPackets) * 2 * 6);
  }

  // ---------- импульсы (нейронные вспышки) ----------

  private spawnPacket() {
    const L = this.links.length / 2;
    if (!L || this.packets.length >= CFG.maxPackets) return;
    const li = Math.floor(this.rand() * L);
    this.packets.push({ a: this.links[li * 2], b: this.links[li * 2 + 1], t: 0 });
  }

  private burst() {
    for (let k = 0; k < 6; k++) this.spawnPacket();
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
      this.renderFrame(dt);
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
    if (this.degraded) return;
    this.frames++;
    this.fpsAcc += dt;
    if (this.frames >= 120) {
      const fps = this.frames / this.fpsAcc;
      if (fps < CFG.lowFps) {
        // авто-даунгрейд слабого GPU: реже связи, без ambient, реже импульсы
        const thin: number[] = [];
        const thinAl: number[] = [];
        for (let li = 0; li < this.links.length / 2; li += 2) {
          thin.push(this.links[li * 2], this.links[li * 2 + 1]);
          thinAl.push(this.linkAl[li]);
        }
        this.links = thin;
        this.linkAl = thinAl;
        this.an = 0;
        this.degraded = true;
        this.hooks.onDowngrade?.();
      }
      this.frames = 0;
      this.fpsAcc = 0;
    }
  }

  private renderFrame(dt: number) {
    const gl = this.gl;
    const m = Math.min(this.w, this.h);
    const mobile = this.w < 720;

    // центр и радиус мозга: справа от текста (моб. — сверху по центру)
    const cx = (mobile ? 0.5 : 0.72) * this.w;
    const cy = (mobile ? 0.32 : 0.46) * this.h;
    const R = (mobile ? 0.3 : 0.36) * m;

    // миграция домов при reseed
    if (dt > 0) {
      const f = Math.min(1, dt * 2.2);
      for (let i = 0; i < this.n * 3; i++) {
        this.home[i] += (this.target[i] - this.home[i]) * f;
      }
    }

    // вращение + дыхание
    const yaw = this.t * CFG.yawSpeed;
    const pitch = Math.sin(this.t * 0.17) * CFG.pitchAmp;
    const breath = 1 + Math.sin(this.t * 0.55) * CFG.breathAmp;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const cpt = Math.cos(pitch), spt = Math.sin(pitch);

    // проекция 3D → экран (+ джиттер-мерцание, + смещение от курсора)
    for (let i = 0; i < this.n; i++) {
      const hx = this.home[i * 3], hy = this.home[i * 3 + 1], hz = this.home[i * 3 + 2];
      const x1 = hx * cyw + hz * syw;
      const z1 = -hx * syw + hz * cyw;
      const y1 = hy * cpt - z1 * spt;
      const z2 = hy * spt + z1 * cpt;
      const jit = Math.sin(this.t * 0.9 + this.ph[i]) * 0.007;
      const persp = 1 + z2 * 0.16;
      this.proj[i * 3] = cx + (x1 + jit) * R * breath * persp + this.off[i * 2];
      this.proj[i * 3 + 1] = cy + (y1 + jit * 0.8) * R * breath * persp + this.off[i * 2 + 1];
      this.proj[i * 3 + 2] = z2;
    }

    // курсор: мягкая тяга ближних частиц (и пружина обратно)
    if (dt > 0) {
      const decay = Math.max(0, 1 - 2.6 * dt);
      const Rp = CFG.pointerR * m;
      for (let i = 0; i < this.n; i++) {
        let ox = this.off[i * 2] * decay;
        let oy = this.off[i * 2 + 1] * decay;
        if (this.pointer.active) {
          const dx = this.pointer.x - this.proj[i * 3];
          const dy = this.pointer.y - this.proj[i * 3 + 1];
          const d = Math.hypot(dx, dy);
          if (d < Rp && d > 1) {
            const f = (1 - d / Rp) * 55 * dt;
            ox += (dx / d) * f;
            oy += (dy / d) * f;
          }
        }
        this.off[i * 2] = ox;
        this.off[i * 2 + 1] = oy;
      }
    }

    // импульсы: спавн + цепочки по синапсам
    if (dt > 0) {
      this.nextPacket -= dt;
      if (this.nextPacket <= 0) {
        this.spawnPacket();
        const [lo, hi] = CFG.packetEvery;
        this.nextPacket = (lo + this.rand() * (hi - lo)) * (this.degraded ? 2 : 1);
      }
      for (let i = this.packets.length - 1; i >= 0; i--) {
        const p = this.packets[i];
        p.t += dt / CFG.packetLife;
        if (p.t >= 1) {
          // нейронная цепочка: сигнал перескакивает в следующий синапс
          if (this.rand() < CFG.chainP && this.packets.length <= CFG.maxPackets) {
            const nexts = this.adj[p.b];
            if (nexts && nexts.length) {
              const nb = nexts[Math.floor(this.rand() * nexts.length)];
              if (nb !== p.a) {
                this.packets[i] = { a: p.b, b: nb, t: 0 };
                continue;
              }
            }
          }
          this.packets.splice(i, 1);
        }
      }
    }

    // ---------- отрисовка ----------
    gl.clear(gl.COLOR_BUFFER_BIT);

    // — связи-синапсы (градиент цвета между концами, глубина гасит) —
    let o = 0;
    const L = this.links.length / 2;
    for (let li = 0; li < L; li++) {
      const a = this.links[li * 2], b = this.links[li * 2 + 1];
      const za = this.proj[a * 3 + 2], zb = this.proj[b * 3 + 2];
      const df = 0.45 + 0.55 * ((za + zb) * 0.25 + 0.5); // глубина пары
      const alpha = this.linkAl[li] * df;
      this.linArr[o++] = this.proj[a * 3]; this.linArr[o++] = this.proj[a * 3 + 1];
      this.linArr[o++] = alpha;
      this.linArr[o++] = this.col[a * 3]; this.linArr[o++] = this.col[a * 3 + 1]; this.linArr[o++] = this.col[a * 3 + 2];
      this.linArr[o++] = this.proj[b * 3]; this.linArr[o++] = this.proj[b * 3 + 1];
      this.linArr[o++] = alpha;
      this.linArr[o++] = this.col[b * 3]; this.linArr[o++] = this.col[b * 3 + 1]; this.linArr[o++] = this.col[b * 3 + 2];
    }
    // — импульсы света: яркий короткий сегмент, бегущий по синапсу —
    for (const p of this.packets) {
      const a = p.a, b = p.b;
      const t0 = Math.max(0, p.t - 0.2);
      const ax = this.proj[a * 3], ay = this.proj[a * 3 + 1];
      const bx = this.proj[b * 3], by = this.proj[b * 3 + 1];
      const x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0;
      const x1 = ax + (bx - ax) * p.t, y1 = ay + (by - ay) * p.t;
      const al = Math.sin(p.t * Math.PI) * 0.95;
      const br = 1.45; // свет ярче собственного цвета узла
      this.linArr[o++] = x0; this.linArr[o++] = y0; this.linArr[o++] = al * 0.6;
      this.linArr[o++] = Math.min(1, this.col[a * 3] * br); this.linArr[o++] = Math.min(1, this.col[a * 3 + 1] * br); this.linArr[o++] = Math.min(1, this.col[a * 3 + 2] * br);
      this.linArr[o++] = x1; this.linArr[o++] = y1; this.linArr[o++] = al;
      this.linArr[o++] = Math.min(1, this.col[b * 3] * br); this.linArr[o++] = Math.min(1, this.col[b * 3 + 1] * br); this.linArr[o++] = Math.min(1, this.col[b * 3 + 2] * br);
    }
    const lineVerts = o / 6;
    gl.useProgram(this.linProg);
    gl.uniform2f(gl.getUniformLocation(this.linProg, "uRes"), this.w, this.h);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.linBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.linArr.subarray(0, o), gl.DYNAMIC_DRAW);
    this.attrib(this.linProg, "aPos", 2, 24, 0);
    this.attrib(this.linProg, "aAlpha", 1, 24, 8);
    this.attrib(this.linProg, "aColor", 3, 24, 12);
    gl.drawArrays(gl.LINES, 0, lineVerts);

    // — частицы мозга + ambient —
    let q = 0;
    for (let i = 0; i < this.n; i++) {
      const depth = this.proj[i * 3 + 2];
      const df = 0.58 + 0.42 * (depth * 0.5 + 0.5); // дальние тусклее/меньше
      const tw = 0.82 + 0.18 * Math.sin(this.t * 1.4 + this.ph[i] * 2); // мерцание
      this.ptsArr[q++] = this.proj[i * 3];
      this.ptsArr[q++] = this.proj[i * 3 + 1];
      this.ptsArr[q++] = this.sz[i] * df;
      this.ptsArr[q++] = this.al[i] * df * tw;
      this.ptsArr[q++] = this.col[i * 3];
      this.ptsArr[q++] = this.col[i * 3 + 1];
      this.ptsArr[q++] = this.col[i * 3 + 2];
    }
    for (let i = 0; i < this.an; i++) {
      const dx = Math.sin(this.t * 0.3 + this.aPh[i]) * 0.012;
      const dy = Math.cos(this.t * 0.24 + this.aPh[i] * 1.3) * 0.012;
      const tw = 0.7 + 0.3 * Math.sin(this.t * 0.9 + this.aPh[i]);
      this.ptsArr[q++] = (this.aHome[i * 2] + dx) * this.w;
      this.ptsArr[q++] = (this.aHome[i * 2 + 1] + dy) * this.h;
      this.ptsArr[q++] = this.aSz[i];
      this.ptsArr[q++] = this.aAl[i] * tw;
      this.ptsArr[q++] = this.aCol[i * 3];
      this.ptsArr[q++] = this.aCol[i * 3 + 1];
      this.ptsArr[q++] = this.aCol[i * 3 + 2];
    }
    gl.useProgram(this.ptsProg);
    gl.uniform2f(gl.getUniformLocation(this.ptsProg, "uRes"), this.w, this.h);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.ptsArr.subarray(0, q), gl.DYNAMIC_DRAW);
    this.attrib(this.ptsProg, "aPos", 2, 28, 0);
    this.attrib(this.ptsProg, "aSize", 1, 28, 8);
    this.attrib(this.ptsProg, "aAlpha", 1, 28, 12);
    this.attrib(this.ptsProg, "aColor", 3, 28, 16);
    gl.drawArrays(gl.POINTS, 0, q / 7);
  }

  private attrib(prog: WebGLProgram, name: string, size: number, stride: number, offset: number) {
    const gl = this.gl;
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  }
}
