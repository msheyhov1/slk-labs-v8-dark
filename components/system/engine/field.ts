// Живое поле v8-dark — чистый WebGL2, без three (бюджет JS).
// «Нейро-мозг»: плотное облако частиц-огоньков в форме мозга (вид сбоку,
// лоб влево), кора лежит ИЗВИЛИНАМИ (гряды и борозды), между соседями —
// связи-синапсы, по которым цепочками бегут импульсы света.
// Ракурс зафиксирован (лёгкое покачивание) — силуэт мозга читается всегда.
// Палитра сдержанная: бело-лавандовый свет + фиолет/синий, редкие искры.
//
// Взаимодействие: курсор зажигает и притягивает ближние частицы, движение
// мыши рождает импульсы в ближних синапсах, клик — всплеск.
//
// Перф-дисциплина: связи считаются ОДИН раз при посеве (k-ближайших в 3D),
// per-frame — только O(n) проекция; пауза на hidden/blur/вне вьюпорта,
// авто-даунгрейд по замеру FPS. `reseed` пересобирает облако (терминал).

import { mulberry32 } from "@/lib/seed";

// Палитра: приглушённый нейро-свет (аддитивное смешение на чёрном)
const PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0.79, 0.76, 1.0],     // бело-лавандовый — доминирует
  [0.545, 0.361, 1.0],   // фиолет #8B5CFF
  [0.31, 0.553, 1.0],    // синий  #4F8DFF
  [0.184, 0.851, 0.659], // бирюза — редкая искра
  [1.0, 0.722, 0.302],   // янтарь — редкая искра
];
const PALETTE_W = [0.52, 0.24, 0.14, 0.06, 0.04] as const;

const CFG = {
  brainDivisor: 750, // px² на частицу мозга (плотно)
  maxBrain: 1600,
  maxBrainMobile: 700,
  minBrain: 400,
  ambientRatio: 0.08, // доля ambient-частиц от мозга
  kNear: 3, // связей на частицу (k-ближайших) — видимая сеть
  maxLink3d: 0.3, // предел длины связи (3D-юниты мозга)
  yawBase: -0.12, // базовый ракурс (почти профиль)
  yawAmp: 0.3, // покачивание вместо вращения — мозг читается всегда
  yawSpeed: 0.22,
  pitchAmp: 0.055,
  breathAmp: 0.024, // «дыхание» масштаба
  pointerR: 0.27, // радиус влияния курсора (× min(w,h))
  pointerPull: 150, // сила тяги (px/с на пике)
  moveSpawnPx: 46, // каждые N px пути мыши — импульс из ближнего синапса
  packetEvery: [0.12, 0.35] as const, // сек между фоновыми импульсами
  packetLife: 0.36, // сек на пролёт импульса по связи
  chainP: 0.72, // вероятность продолжить цепочку в следующем синапсе
  maxPackets: 42,
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
  private nextPacket = 0.6;

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
  private prevPtr = { x: 0, y: 0 };
  private moveAcc = 0; // накопленный путь мыши → импульсы
  private parX = 0; // параллакс центра мозга
  private parY = 0;
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
      const nx = e.clientX - r.left;
      const ny = e.clientY - r.top;
      if (this.pointer.active) {
        this.moveAcc += Math.hypot(nx - this.pointer.x, ny - this.pointer.y);
      }
      this.pointer = {
        x: nx,
        y: ny,
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
      // статика: мозг замер в выразительном ракурсе — один кадр
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

  // ---------- форма мозга (3D, вид сбоку, лоб ВЛЕВО) ----------

  private inCerebrum(x: number, y: number, z: number): boolean {
    const dx = x + 0.05, dy = y + 0.1;
    return (dx * dx) / (0.95 * 0.95) + (dy * dy) / (0.62 * 0.62) + (z * z) / (0.6 * 0.6) <= 1;
  }
  private inTemporal(x: number, y: number, z: number): boolean {
    const dx = x + 0.42, dy = y - 0.28;
    return (dx * dx) / (0.48 * 0.48) + (dy * dy) / (0.3 * 0.3) + (z * z) / (0.5 * 0.5) <= 1;
  }
  private inCerebellum(x: number, y: number, z: number): boolean {
    const dx = x - 0.52, dy = y - 0.38;
    return (dx * dx) / (0.33 * 0.33) + (dy * dy) / (0.25 * 0.25) + (z * z) / (0.38 * 0.38) <= 1;
  }
  private inStem(x: number, y: number, z: number): boolean {
    const dx = x - 0.26, dy = y - 0.6;
    return (dx * dx) / (0.13 * 0.13) + (dy * dy) / (0.22 * 0.22) + (z * z) / (0.12 * 0.12) <= 1;
  }

  /** Внутри ли точка мозга: большой мозг + височная доля + мозжечок + ствол,
   *  минус вырез между височной долей и мозжечком, минус продольная щель. */
  private insideBrain(x: number, y: number, z: number): boolean {
    const cere = this.inCerebrum(x, y, z) || this.inTemporal(x, y, z);
    const parts = cere || this.inCerebellum(x, y, z) || this.inStem(x, y, z);
    if (!parts) return false;
    // вырез снизу: разделяет височную долю и мозжечок (узнаваемый профиль)
    const nx = x - 0.08, ny = y - 0.56;
    const notch =
      (nx * nx) / (0.24 * 0.24) + (ny * ny) / (0.2 * 0.2) + (z * z) / (0.7 * 0.7) <= 1 &&
      !this.inStem(x, y, z);
    if (notch) return false;
    // продольная щель между полушариями (сверху)
    if (Math.abs(z) < 0.04 && y < -0.12 && cere) return false;
    return true;
  }

  /** Извилины коры: волнистые гряды (принимаем точку, если она на гряде).
   *  Борозды между грядами остаются тёмными — мозг «в морщинах». */
  private onGyrus(x: number, y: number, z: number): boolean {
    if (this.inCerebellum(x, y, z) && !this.inCerebrum(x, y, z)) {
      // мозжечок: полосы тоньше и чаще
      return Math.sin(16 * (y - 0.38) + 6 * (x - 0.52)) > -0.15;
    }
    // кора: волнистые гряды, изгиб зависит от x и глубины
    return Math.sin(11 * y + 3.4 * Math.sin(2.3 * x) + 2.2 * z) > -0.2;
  }

  /** Случайная точка мозга: ~72% — на грядах коры (поверхность), остальное —
   *  разреженное свечение в глубине. */
  private sampleBrainPoint(): [number, number, number] {
    const shell = this.rand() < 0.72;
    for (let tries = 0; tries < 80; tries++) {
      const x = (this.rand() * 2 - 1) * 1.15;
      const y = (this.rand() * 2 - 1) * 1.0;
      const z = (this.rand() * 2 - 1) * 0.75;
      if (!this.insideBrain(x, y, z)) continue;
      if (shell) {
        // «кора»: узкая оболочка + попадание на гряду-извилину
        if (this.insideBrain(x / 0.86, y / 0.86, z / 0.86)) continue;
        if (!this.onGyrus(x, y, z)) continue;
      }
      return [x, y, z];
    }
    return [0, -0.1, 0];
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
      const hub = this.rand() < 0.05; // редкие яркие «хабы»
      this.sz[i] = (hub ? 4.6 : 2.0 + this.rand() * 2.4) * this.dpr;
      this.al[i] = hub ? 0.95 : 0.55 + this.rand() * 0.4;
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
      this.aSz[i] = (1.4 + this.rand() * 1.5) * this.dpr;
      this.aAl[i] = 0.12 + this.rand() * 0.24;
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
    const K = CFG.kNear;

    const bd: number[] = new Array(K);
    const bi: number[] = new Array(K);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < K; k++) { bd[k] = Infinity; bi[k] = -1; }
      const ix = pts[i * 3], iy = pts[i * 3 + 1], iz = pts[i * 3 + 2];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = ix - pts[j * 3];
        const dy = iy - pts[j * 3 + 1];
        const dz = iz - pts[j * 3 + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d >= bd[K - 1]) continue;
        // вставка в топ-K
        let k = K - 1;
        while (k > 0 && bd[k - 1] > d) { bd[k] = bd[k - 1]; bi[k] = bi[k - 1]; k--; }
        bd[k] = d; bi[k] = j;
      }
      for (let k = 0; k < K; k++) {
        const j = bi[k];
        if (j < 0 || bd[k] > maxD2) continue;
        const key = i < j ? i * 65536 + j : j * 65536 + i;
        if (seen.has(key)) continue;
        seen.add(key);
        this.links.push(i, j);
        this.linkAl.push(0.2 + this.rand() * 0.14);
        this.adj[i].push(j);
        this.adj[j].push(i);
      }
    }

    const L = this.links.length / 2;
    this.linArr = new Float32Array((L + CFG.maxPackets) * 2 * 6);
  }

  // ---------- импульсы (нейронные вспышки) ----------

  private spawnPacket(fromNode?: number) {
    if (this.packets.length >= CFG.maxPackets) return;
    if (fromNode !== undefined) {
      const nexts = this.adj[fromNode];
      if (!nexts || !nexts.length) return;
      const nb = nexts[Math.floor(this.rand() * nexts.length)];
      this.packets.push({ a: fromNode, b: nb, t: 0 });
      return;
    }
    const L = this.links.length / 2;
    if (!L) return;
    const li = Math.floor(this.rand() * L);
    this.packets.push({ a: this.links[li * 2], b: this.links[li * 2 + 1], t: 0 });
  }

  private burst() {
    for (let k = 0; k < 12; k++) this.spawnPacket();
  }

  /** Импульс из случайного узла рядом с курсором (нейро-отклик на движение). */
  private spawnNearPointer(radiusPx: number) {
    for (let tries = 0; tries < 50; tries++) {
      const i = Math.floor(this.rand() * this.n);
      const dx = this.proj[i * 3] - this.pointer.x;
      const dy = this.proj[i * 3 + 1] - this.pointer.y;
      if (dx * dx + dy * dy < radiusPx * radiusPx) {
        this.spawnPacket(i);
        return;
      }
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

    // центр и радиус мозга: справа от текста (моб. — сверху по центру).
    // Лёгкий параллакс к курсору — сцена дышит вместе с рукой.
    const cx0 = (mobile ? 0.5 : 0.72) * this.w;
    const cy0 = (mobile ? 0.32 : 0.46) * this.h;
    const R = (mobile ? 0.3 : 0.38) * m;
    if (dt > 0) {
      const tx = this.pointer.active ? (this.pointer.x - cx0) * 0.045 : 0;
      const ty = this.pointer.active ? (this.pointer.y - cy0) * 0.045 : 0;
      const lim = 22;
      const cl = (v: number) => Math.max(-lim, Math.min(lim, v));
      this.parX += (cl(tx) - this.parX) * Math.min(1, dt * 2.5);
      this.parY += (cl(ty) - this.parY) * Math.min(1, dt * 2.5);
    }
    const cx = cx0 + this.parX;
    const cy = cy0 + this.parY;

    // миграция домов при reseed
    if (dt > 0) {
      const f = Math.min(1, dt * 2.2);
      for (let i = 0; i < this.n * 3; i++) {
        this.home[i] += (this.target[i] - this.home[i]) * f;
      }
    }

    // ракурс: профиль + мягкое покачивание (НЕ полное вращение) + дыхание
    const yaw = CFG.yawBase + Math.sin(this.t * CFG.yawSpeed) * CFG.yawAmp;
    const pitch = Math.sin(this.t * 0.31) * CFG.pitchAmp;
    const breath = 1 + Math.sin(this.t * 0.7) * CFG.breathAmp;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const cpt = Math.cos(pitch), spt = Math.sin(pitch);

    // проекция 3D → экран (+ джиттер-мерцание, + смещение от курсора)
    for (let i = 0; i < this.n; i++) {
      const hx = this.home[i * 3], hy = this.home[i * 3 + 1], hz = this.home[i * 3 + 2];
      const x1 = hx * cyw + hz * syw;
      const z1 = -hx * syw + hz * cyw;
      const y1 = hy * cpt - z1 * spt;
      const z2 = hy * spt + z1 * cpt;
      const jit = Math.sin(this.t * 1.1 + this.ph[i]) * 0.006;
      const persp = 1 + z2 * 0.14;
      this.proj[i * 3] = cx + (x1 + jit) * R * breath * persp + this.off[i * 2];
      this.proj[i * 3 + 1] = cy + (y1 + jit * 0.8) * R * breath * persp + this.off[i * 2 + 1];
      this.proj[i * 3 + 2] = z2;
    }

    // курсор: заметная тяга ближних частиц (и пружина обратно)
    const Rp = CFG.pointerR * m;
    if (dt > 0) {
      const decay = Math.max(0, 1 - 3.0 * dt);
      for (let i = 0; i < this.n; i++) {
        let ox = this.off[i * 2] * decay;
        let oy = this.off[i * 2 + 1] * decay;
        if (this.pointer.active) {
          const dx = this.pointer.x - this.proj[i * 3];
          const dy = this.pointer.y - this.proj[i * 3 + 1];
          const d = Math.hypot(dx, dy);
          if (d < Rp && d > 1) {
            const f = (1 - d / Rp) * CFG.pointerPull * dt;
            ox += (dx / d) * f;
            oy += (dy / d) * f;
          }
        }
        this.off[i * 2] = ox;
        this.off[i * 2 + 1] = oy;
      }

      // движение мыши рождает импульсы в ближних синапсах
      if (this.pointer.active && this.moveAcc >= CFG.moveSpawnPx) {
        this.moveAcc = 0;
        this.spawnNearPointer(Rp * 0.7);
      }

      // фоновые импульсы: спавн + цепочки по синапсам
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
      const df = 0.5 + 0.5 * ((za + zb) * 0.25 + 0.5); // глубина пары
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
      const t0 = Math.max(0, p.t - 0.22);
      const ax = this.proj[a * 3], ay = this.proj[a * 3 + 1];
      const bx = this.proj[b * 3], by = this.proj[b * 3 + 1];
      const x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0;
      const x1 = ax + (bx - ax) * p.t, y1 = ay + (by - ay) * p.t;
      const al = Math.sin(p.t * Math.PI);
      const br = 1.6; // свет ярче собственного цвета узла
      this.linArr[o++] = x0; this.linArr[o++] = y0; this.linArr[o++] = al * 0.65;
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
    const pActive = this.pointer.active;
    for (let i = 0; i < this.n; i++) {
      const depth = this.proj[i * 3 + 2];
      const df = 0.58 + 0.42 * (depth * 0.5 + 0.5); // дальние тусклее/меньше
      const tw = 0.8 + 0.2 * Math.sin(this.t * 1.7 + this.ph[i] * 2); // мерцание
      // курсор «зажигает» ближние частицы
      let ex = 0;
      if (pActive) {
        const dx = this.proj[i * 3] - this.pointer.x;
        const dy = this.proj[i * 3 + 1] - this.pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < Rp * Rp) ex = 1 - Math.sqrt(d2) / Rp;
      }
      this.ptsArr[q++] = this.proj[i * 3];
      this.ptsArr[q++] = this.proj[i * 3 + 1];
      this.ptsArr[q++] = this.sz[i] * df * (1 + ex * 0.5);
      this.ptsArr[q++] = Math.min(1, this.al[i] * df * tw * (1 + ex * 1.1));
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
