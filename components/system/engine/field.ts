// Живое поле v8-dark — чистый WebGL2, без three (бюджет JS).
// «Нейро-мозг»: ТОЛЬКО частицы и сеть связей — никаких треугольников.
// Два слоя:
//  1) GPU-пыль: ~12 000 круглых частиц-огоньков (масса и глубина мозга),
//     вся анимация в vertex-шейдере (как GPGPU у студийных сайтов);
//  2) НЕЙРОСЕТЬ с НАСТОЯЩЕЙ ФИЗИКОЙ (CPU): ~1000 узлов-нейронов, связи-
//     синапсы как пружины. Толкаешь узел — соседи тянутся за ним по
//     связям, рябь расходится по сети, всё желейно оседает (масса+
//     демпфирование). Импульсы света бегут по синапсам цепочками.
//
// Взаимодействие: курсор РАСТАЛКИВАЕТ сеть (+вихрь), сила растёт со
// скоростью мыши; клик — УДАРНАЯ ВОЛНА (кольцо бьёт по сети импульсом);
// интро-сборка: частицы слетаются и собирают мозг (wall-clock).
//
// Перф: физика O(узлы+связи) ≈ тривиально; пыль — униформы раз в кадр.
// Пауза на hidden/blur/вне вьюпорта, авто-даунгрейд по FPS.

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
  // GPU-пыль (круглые частицы)
  cloudDivisor: 95, // px² на частицу
  maxCloud: 12000,
  maxCloudMobile: 5000,
  minCloud: 3000,
  // нейроны (физическая сеть)
  hubDivisor: 1350,
  maxHubs: 1100,
  maxHubsMobile: 520,
  minHubs: 320,
  ambientRatio: 0.1,
  kNear: 3,
  maxLink3d: 0.32,
  // сцена
  yawBase: -0.12,
  yawAmp: 0.34,
  yawSpeed: 0.26,
  pitchAmp: 0.07,
  breathAmp: 0.03,
  hoverGrow: 0.04,
  introDur: 1.7,
  // ФИЗИКА СЕТИ (пружины, масса=1)
  kHome: 26, // пружина к дому (держит форму мозга)
  kLink: 80, // пружина связи (тянет соседей — рябь по сети)
  dampRate: 3.4, // демпфирование (ниже — дольше желейно колышется)
  maxDisp: 110, // предел смещения узла (стабильность)
  // взаимодействие
  pointerR: 0.28, // × min(w,h)
  mouseForce: 3200, // сила расталкивания (px/с²)
  swirlRatio: 0.45, // доля вихревой компоненты
  dustPushPx: 30, // раскрытие пыли у курсора (в шейдере)
  dustSwirlPx: 13,
  waveSpeed: 760,
  waveLife: 0.95,
  waveKick: 1600, // импульс волны по сети (px/с²·band)
  waveAmpDust: 26, // смещение пыли в кольце (px, в шейдере)
  moveSpawnPx: 30,
  packetEvery: [0.08, 0.25] as const,
  packetLife: 0.36,
  chainP: 0.78,
  maxPackets: 56,
  lowFps: 45,
};

type Packet = { a: number; b: number; t: number };
type Wave = { x: number; y: number; t0: number };

export type FieldHooks = {
  onDowngrade?: () => void;
};

export class LivingFieldEngine {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private dpr: number;
  private w = 0;
  private h = 0;

  // — GPU-пыль —
  private cloudN = 0;
  private cloudDrawN = 0;
  private cloudProg!: WebGLProgram;
  private cloudBuf!: WebGLBuffer;
  private cloudVao!: WebGLVertexArrayObject;
  private cloudU: Record<string, WebGLUniformLocation | null> = {};

  // — нейроны (физическая сеть) —
  private n = 0;
  private home = new Float32Array(0); // x,y,z дома (объектное пространство)
  private target = new Float32Array(0);
  private ph = new Float32Array(0);
  private col = new Float32Array(0);
  private nsz = new Float32Array(0); // размер узла (px)
  private hproj = new Float32Array(0); // проекция дома: px,py,depth
  private disp = new Float32Array(0); // физ. смещение узла от дома (px)
  private vel = new Float32Array(0); // скорость узла (px/с)

  private links: number[] = [];
  private linkAl: number[] = [];
  private adj: number[][] = [];

  // — ambient-огоньки —
  private an = 0;
  private aHome = new Float32Array(0);
  private aPh = new Float32Array(0);
  private aSz = new Float32Array(0);
  private aAl = new Float32Array(0);
  private aCol = new Float32Array(0);

  private packets: Packet[] = [];
  private nextPacket = 0.6;
  private waves: Wave[] = [];

  private rand: () => number;
  private reduced: boolean;
  private hooks: FieldHooks;

  private t = 0;
  private raf = 0;
  private running = false;
  private last = 0;
  private introT = 0;
  private introStart = -1; // wall-clock старт сборки — стойко к троттлингу вкладки

  // GL (линии + точки узлов/ambient)
  private linProg!: WebGLProgram;
  private ptsProg!: WebGLProgram;
  private linBuf!: WebGLBuffer;
  private ptsBuf!: WebGLBuffer;
  private linVao!: WebGLVertexArrayObject;
  private ptsVao!: WebGLVertexArrayObject;
  private linArr = new Float32Array(0);
  private ptsArr = new Float32Array(0);

  // перф
  private frames = 0;
  private fpsAcc = 0;
  private degraded = false;

  private pointer = { x: 0, y: 0, active: false };
  private moveAcc = 0;
  private frameMove = 0;
  private ptrSpeed = 0;
  private parX = 0;
  private parY = 0;
  private hoverAmt = 0;
  private disposed = false;
  private cleanupFns: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, seed: number, reduced: boolean, hooks: FieldHooks = {}) {
    this.canvas = canvas;
    this.reduced = reduced;
    this.hooks = hooks;
    this.rand = mulberry32(seed);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
    if (!gl) throw new Error("webgl2-unavailable");
    this.gl = gl;

    this.initGl();
    this.resize();
    this.seedAll();
    // отладочная ручка (не секрет): состояние поля в консоли
    (window as unknown as { __slkField?: unknown }).__slkField = this;

    const onResize = () => this.resize();
    window.addEventListener("resize", onResize);
    this.cleanupFns.push(() => window.removeEventListener("resize", onResize));

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const nx = e.clientX - r.left;
      const ny = e.clientY - r.top;
      if (this.pointer.active) {
        const d = Math.hypot(nx - this.pointer.x, ny - this.pointer.y);
        this.moveAcc += d;
        this.frameMove += d;
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
      // ударная волна из точки клика + всплеск импульсов
      this.waves.push({ x: e.clientX - r.left, y: e.clientY - r.top, t0: this.t });
      if (this.waves.length > 3) this.waves.shift();
      this.burst();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    this.cleanupFns.push(() => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    });

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
      this.introT = 1;
      this.renderFrame(0);
    } else {
      this.start();
    }
  }

  // ---------- публичное ----------

  reseed(seed: number) {
    this.rand = mulberry32(seed);
    for (let i = 0; i < this.n; i++) {
      const p = this.sampleBrainPoint();
      this.target[i * 3] = p[0];
      this.target[i * 3 + 1] = p[1];
      this.target[i * 3 + 2] = p[2];
    }
    this.buildLinks(this.target);
    this.uploadCloud();
    this.introT = 0.35;
    this.introStart = performance.now() - CFG.introDur * 1000 * 0.35;
    this.burst();
    if (this.reduced) {
      this.home.set(this.target);
      this.introT = 1;
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
    gl.deleteBuffer(this.cloudBuf);
    gl.deleteBuffer(this.linBuf);
    gl.deleteBuffer(this.ptsBuf);
    gl.deleteVertexArray(this.cloudVao);
    gl.deleteVertexArray(this.linVao);
    gl.deleteVertexArray(this.ptsVao);
    gl.deleteProgram(this.cloudProg);
    gl.deleteProgram(this.linProg);
    gl.deleteProgram(this.ptsProg);
  }

  // ---------- инициализация GL ----------

  private initGl() {
    const gl = this.gl;

    // === GPU-пыль: круглые частицы-огоньки, движение в шейдере ===
    const vsCloud = `#version 300 es
      precision highp float;
      in vec3 aHome; in vec3 aCol; in float aRnd; in float aSz;
      uniform vec2 uRes; uniform vec2 uCenter; uniform float uR;
      uniform vec4 uRot;      // cosYaw, sinYaw, cosPitch, sinPitch
      uniform float uBreath; uniform float uT; uniform float uIntro;
      uniform float uDpr;
      uniform vec4 uMouse;    // x,y px; z радиус px; w сила 0..1
      uniform vec4 uWaves[3]; // x,y px; z радиус кольца px; w амплитуда px
      out vec3 vColor; out float vAlpha;

      void main() {
        float rnd = aRnd;
        // интро-сборка: из рассеянной сферы к дому (стаггер)
        float d0 = fract(rnd * 7.31) * 0.55;
        float lt = clamp((uIntro - d0) / 0.45, 0.0, 1.0);
        float ease = 1.0 - pow(1.0 - lt, 3.0);
        vec3 dir = normalize(aHome + vec3(0.013, 0.007, 0.021));
        vec3 scat = dir * (1.9 + fract(rnd * 13.7) * 1.9);
        vec3 hp = mix(scat, aHome, ease);
        // поворот профиля + тангаж
        float x1 = hp.x * uRot.x + hp.z * uRot.y;
        float z1 = -hp.x * uRot.y + hp.z * uRot.x;
        float y1 = hp.y * uRot.z - z1 * uRot.w;
        float z2 = hp.y * uRot.w + z1 * uRot.z;
        float persp = 1.0 + z2 * 0.14;
        vec2 pos = uCenter + vec2(x1, y1) * uR * uBreath * persp;
        // живое дрожание
        pos += vec2(sin(uT * 1.4 + rnd * 39.0), cos(uT * 1.2 + rnd * 27.0)) * 2.2;
        float excite = 0.0;
        // курсор: раскрытие + вихрь
        vec2 md = pos - uMouse.xy;
        float mr = length(md) + 0.0001;
        if (mr < uMouse.z) {
          float f = (1.0 - mr / uMouse.z) * uMouse.w;
          vec2 mdir = md / mr;
          pos += mdir * f * ${CFG.dustPushPx.toFixed(1)};
          pos += vec2(-mdir.y, mdir.x) * f * ${CFG.dustSwirlPx.toFixed(1)};
          excite += f;
        }
        // ударные волны
        for (int i = 0; i < 3; i++) {
          vec4 wv = uWaves[i];
          if (wv.w <= 0.0) continue;
          vec2 wd = pos - wv.xy;
          float wr = length(wd) + 0.0001;
          float band = exp(-pow(wr - wv.z, 2.0) / 1100.0);
          pos += (wd / wr) * band * wv.w;
          excite += band * (wv.w / ${CFG.waveAmpDust.toFixed(1)}) * 0.8;
        }
        // глубина, мерцание, волна активности
        float df = 0.55 + 0.45 * (z2 * 0.5 + 0.5);
        float tw = 0.72 + 0.28 * sin(uT * 2.1 + rnd * 43.0);
        float act = sin(uT * 0.9 - (aHome.x * 2.0 + aHome.y * 1.2));
        float wact = 1.0 + max(act, 0.0) * max(act, 0.0) * 0.3;
        vec2 clip = (pos / uRes) * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
        gl_PointSize = aSz * df * (1.0 + excite * 0.5) * uDpr;
        vColor = aCol * (1.0 + excite * 0.9);
        vAlpha = clamp((0.3 + 0.4 * fract(rnd * 5.3)) * df * tw * wact
                       * (0.12 + 0.88 * ease) + excite * 0.25, 0.0, 1.0);
      }`;
    const fsCloud = `#version 300 es
      precision mediump float;
      in vec3 vColor; in float vAlpha; out vec4 o;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        float core = smoothstep(0.3, 0.0, d);
        float halo = smoothstep(1.0, 0.25, d);
        float a = (core * 0.8 + halo * 0.45) * vAlpha;
        o = vec4(vColor * (0.75 + 0.5 * core), a);
      }`;

    // === линии (синапсы + импульсы) ===
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

    // === точки: узлы-нейроны + ambient (яркое ядро + свечение) ===
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
    const fsPts = `#version 300 es
      precision mediump float;
      in float vAlpha; in vec3 vColor; out vec4 o;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        float core = smoothstep(0.35, 0.0, d);
        float halo = smoothstep(1.0, 0.2, d);
        float a = (core * 0.9 + halo * 0.5) * vAlpha;
        o = vec4(vColor * (0.8 + 0.6 * core), a);
      }`;

    this.cloudProg = this.program(vsCloud, fsCloud);
    this.linProg = this.program(vsLin, fsLin);
    this.ptsProg = this.program(vsPts, fsPts);

    this.cloudBuf = gl.createBuffer()!;
    this.linBuf = gl.createBuffer()!;
    this.ptsBuf = gl.createBuffer()!;
    this.cloudVao = gl.createVertexArray()!;
    this.linVao = gl.createVertexArray()!;
    this.ptsVao = gl.createVertexArray()!;

    // VAO пыли: обычные атрибуты (POINTS), stride 8 float
    gl.bindVertexArray(this.cloudVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cloudBuf);
    this.attrib(this.cloudProg, "aHome", 3, 32, 0);
    this.attrib(this.cloudProg, "aCol", 3, 32, 12);
    this.attrib(this.cloudProg, "aRnd", 1, 32, 24);
    this.attrib(this.cloudProg, "aSz", 1, 32, 28);
    gl.bindVertexArray(null);

    gl.bindVertexArray(this.linVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.linBuf);
    this.attrib(this.linProg, "aPos", 2, 24, 0);
    this.attrib(this.linProg, "aAlpha", 1, 24, 8);
    this.attrib(this.linProg, "aColor", 3, 24, 12);
    gl.bindVertexArray(null);

    gl.bindVertexArray(this.ptsVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptsBuf);
    this.attrib(this.ptsProg, "aPos", 2, 28, 0);
    this.attrib(this.ptsProg, "aSize", 1, 28, 8);
    this.attrib(this.ptsProg, "aAlpha", 1, 28, 12);
    this.attrib(this.ptsProg, "aColor", 3, 28, 16);
    gl.bindVertexArray(null);

    for (const u of ["uRes", "uCenter", "uR", "uRot", "uBreath", "uT", "uIntro", "uDpr", "uMouse", "uWaves"]) {
      this.cloudU[u] = gl.getUniformLocation(this.cloudProg, u === "uWaves" ? "uWaves[0]" : u);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
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

  private attrib(prog: WebGLProgram, name: string, size: number, stride: number, offset: number) {
    const gl = this.gl;
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
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

  private insideBrain(x: number, y: number, z: number): boolean {
    const cere = this.inCerebrum(x, y, z) || this.inTemporal(x, y, z);
    const parts = cere || this.inCerebellum(x, y, z) || this.inStem(x, y, z);
    if (!parts) return false;
    const nx = x - 0.08, ny = y - 0.56;
    const notch =
      (nx * nx) / (0.24 * 0.24) + (ny * ny) / (0.2 * 0.2) + (z * z) / (0.7 * 0.7) <= 1 &&
      !this.inStem(x, y, z);
    if (notch) return false;
    if (Math.abs(z) < 0.04 && y < -0.12 && cere) return false;
    return true;
  }

  private onGyrus(x: number, y: number, z: number): boolean {
    if (this.inCerebellum(x, y, z) && !this.inCerebrum(x, y, z)) {
      return Math.sin(16 * (y - 0.38) + 6 * (x - 0.52)) > -0.15;
    }
    return Math.sin(11 * y + 3.4 * Math.sin(2.3 * x) + 2.2 * z) > -0.2;
  }

  private sampleBrainPoint(): [number, number, number] {
    const shell = this.rand() < 0.72;
    for (let tries = 0; tries < 80; tries++) {
      const x = (this.rand() * 2 - 1) * 1.15;
      const y = (this.rand() * 2 - 1) * 1.0;
      const z = (this.rand() * 2 - 1) * 0.75;
      if (!this.insideBrain(x, y, z)) continue;
      if (shell) {
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

  // ---------- посев ----------

  private seedAll() {
    const mobile = this.w < 720;
    const area = this.w * this.h;

    // GPU-пыль
    const cloudCap = mobile ? CFG.maxCloudMobile : CFG.maxCloud;
    this.cloudN = Math.max(CFG.minCloud, Math.min(cloudCap, Math.round(area / CFG.cloudDivisor)));
    this.cloudDrawN = this.cloudN;
    this.uploadCloud();

    // нейроны
    const hubCap = mobile ? CFG.maxHubsMobile : CFG.maxHubs;
    this.n = Math.max(CFG.minHubs, Math.min(hubCap, Math.round(area / CFG.hubDivisor)));
    this.home = new Float32Array(this.n * 3);
    this.target = new Float32Array(this.n * 3);
    this.ph = new Float32Array(this.n);
    this.col = new Float32Array(this.n * 3);
    this.nsz = new Float32Array(this.n);
    this.hproj = new Float32Array(this.n * 3);
    this.disp = new Float32Array(this.n * 2);
    this.vel = new Float32Array(this.n * 2);
    for (let i = 0; i < this.n; i++) {
      const p = this.sampleBrainPoint();
      this.home[i * 3] = p[0];
      this.home[i * 3 + 1] = p[1];
      this.home[i * 3 + 2] = p[2];
      this.ph[i] = this.rand() * Math.PI * 2;
      const hub = this.rand() < 0.06; // редкие крупные нейроны
      this.nsz[i] = (hub ? 7.5 : 3.2 + this.rand() * 2.6) * this.dpr;
      this.pickColor(this.col, i * 3);
    }
    this.target.set(this.home);
    this.buildLinks(this.home);

    // ambient
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
      this.aAl[i] = 0.1 + this.rand() * 0.2;
      this.pickColor(this.aCol, i * 3);
    }
    this.ptsArr = new Float32Array((this.n + this.an) * 7);
  }

  /** Дома GPU-пыли: та же форма мозга. */
  private uploadCloud() {
    const gl = this.gl;
    const arr = new Float32Array(this.cloudN * 8);
    const tmp = new Float32Array(3);
    for (let i = 0; i < this.cloudN; i++) {
      const p = this.sampleBrainPoint();
      const o = i * 8;
      arr[o] = p[0]; arr[o + 1] = p[1]; arr[o + 2] = p[2];
      this.pickColor(tmp, 0);
      arr[o + 3] = tmp[0]; arr[o + 4] = tmp[1]; arr[o + 5] = tmp[2];
      arr[o + 6] = this.rand();
      arr[o + 7] = 2.6 + this.rand() * 3.6; // диаметр точки, px (до dpr)
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cloudBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
  }

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

  // ---------- импульсы ----------

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

  private spawnNearPointer(radiusPx: number) {
    for (let tries = 0; tries < 50; tries++) {
      const i = Math.floor(this.rand() * this.n);
      const dx = this.hproj[i * 3] + this.disp[i * 2] - this.pointer.x;
      const dy = this.hproj[i * 3 + 1] + this.disp[i * 2 + 1] - this.pointer.y;
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
        this.cloudDrawN = Math.floor(this.cloudN * 0.5);
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

    // интро по wall-clock от первого кадра
    if (dt > 0) {
      if (this.introStart < 0) this.introStart = performance.now();
      this.introT = Math.max(
        this.introT,
        Math.min(1, (performance.now() - this.introStart) / (CFG.introDur * 1000)),
      );
    }
    const introGate = Math.min(1, Math.max(0, (this.introT - 0.6) / 0.4));

    if (dt > 0) {
      const inst = this.frameMove / Math.max(dt, 1e-4);
      this.ptrSpeed += (inst - this.ptrSpeed) * Math.min(1, dt * 8);
      this.frameMove = 0;
    }

    const cx0 = (mobile ? 0.5 : 0.72) * this.w;
    const cy0 = (mobile ? 0.32 : 0.46) * this.h;
    const R = (mobile ? 0.3 : 0.38) * m;
    if (dt > 0) {
      const tx = this.pointer.active ? (this.pointer.x - cx0) * 0.045 * introGate : 0;
      const ty = this.pointer.active ? (this.pointer.y - cy0) * 0.045 * introGate : 0;
      const lim = 22;
      const cl = (v: number) => Math.max(-lim, Math.min(lim, v));
      this.parX += (cl(tx) - this.parX) * Math.min(1, dt * 2.5);
      this.parY += (cl(ty) - this.parY) * Math.min(1, dt * 2.5);
    }
    const cx = cx0 + this.parX;
    const cy = cy0 + this.parY;

    if (dt > 0) {
      const near =
        this.pointer.active &&
        Math.hypot(this.pointer.x - cx, this.pointer.y - cy) < R * 1.35;
      this.hoverAmt += ((near ? 1 : 0) - this.hoverAmt) * Math.min(1, dt * 3);
    }

    if (dt > 0) {
      const f = Math.min(1, dt * 2.2);
      for (let i = 0; i < this.n * 3; i++) {
        this.home[i] += (this.target[i] - this.home[i]) * f;
      }
    }

    const yaw = CFG.yawBase + Math.sin(this.t * CFG.yawSpeed) * CFG.yawAmp;
    const pitch = Math.sin(this.t * 0.4) * CFG.pitchAmp;
    const breath =
      (1 + Math.sin(this.t * 0.9) * CFG.breathAmp) * (1 + this.hoverAmt * CFG.hoverGrow);
    const cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const cpt = Math.cos(pitch), spt = Math.sin(pitch);

    // волны: возраст → радиус/амплитуда
    const waveU = new Float32Array(12);
    for (let i = this.waves.length - 1; i >= 0; i--) {
      if (this.t - this.waves[i].t0 > CFG.waveLife) this.waves.splice(i, 1);
    }
    for (let i = 0; i < 3; i++) {
      const wv = this.waves[i];
      if (!wv) continue;
      const age = this.t - wv.t0;
      const k = 1 - age / CFG.waveLife;
      waveU[i * 4] = wv.x;
      waveU[i * 4 + 1] = wv.y;
      waveU[i * 4 + 2] = age * CFG.waveSpeed;
      waveU[i * 4 + 3] = CFG.waveAmpDust * k * k;
    }

    // ---------- нейроны: проекция дома (интро → поворот) ----------
    for (let i = 0; i < this.n; i++) {
      const rnd = this.ph[i] / (Math.PI * 2);
      const d0 = (rnd * 7.31 - Math.floor(rnd * 7.31)) * 0.55;
      const lt = Math.min(1, Math.max(0, (this.introT - d0) / 0.45));
      const ease = 1 - Math.pow(1 - lt, 3);
      let hx = this.home[i * 3], hy = this.home[i * 3 + 1], hz = this.home[i * 3 + 2];
      if (ease < 1) {
        const len = Math.hypot(hx + 0.013, hy + 0.007, hz + 0.021) || 1;
        const sc = 1.9 + (rnd * 13.7 - Math.floor(rnd * 13.7)) * 1.9;
        const sx = ((hx + 0.013) / len) * sc;
        const sy = ((hy + 0.007) / len) * sc;
        const sz = ((hz + 0.021) / len) * sc;
        hx = sx + (hx - sx) * ease;
        hy = sy + (hy - sy) * ease;
        hz = sz + (hz - sz) * ease;
      }
      const x1 = hx * cyw + hz * syw;
      const z1 = -hx * syw + hz * cyw;
      const y1 = hy * cpt - z1 * spt;
      const z2 = hy * spt + z1 * cpt;
      const jit = Math.sin(this.t * 1.3 + this.ph[i]) * 0.006;
      const persp = 1 + z2 * 0.14;
      this.hproj[i * 3] = cx + (x1 + jit) * R * breath * persp;
      this.hproj[i * 3 + 1] = cy + (y1 + jit * 0.8) * R * breath * persp;
      this.hproj[i * 3 + 2] = z2;
    }

    // ---------- ФИЗИКА СЕТИ: пружины дом+связи, курсор, волны ----------
    if (dt > 0) {
      const damp = Math.exp(-CFG.dampRate * dt);
      const Rp = CFG.pointerR * m;
      const mForce =
        CFG.mouseForce *
        introGate *
        (this.pointer.active ? 0.7 + Math.min(1, this.ptrSpeed / 700) * 0.6 : 0);

      // силы связей: соседи тянут друг друга — рябь бежит по сети
      const L = this.links.length / 2;
      for (let li = 0; li < L; li++) {
        const a = this.links[li * 2], b = this.links[li * 2 + 1];
        const fx = (this.disp[b * 2] - this.disp[a * 2]) * CFG.kLink * dt;
        const fy = (this.disp[b * 2 + 1] - this.disp[a * 2 + 1]) * CFG.kLink * dt;
        this.vel[a * 2] += fx; this.vel[a * 2 + 1] += fy;
        this.vel[b * 2] -= fx; this.vel[b * 2 + 1] -= fy;
      }

      for (let i = 0; i < this.n; i++) {
        let vx = this.vel[i * 2];
        let vy = this.vel[i * 2 + 1];
        const dx = this.disp[i * 2];
        const dy = this.disp[i * 2 + 1];
        // пружина к дому (держит форму мозга)
        vx += -CFG.kHome * dx * dt;
        vy += -CFG.kHome * dy * dt;
        // курсор: расталкивание + вихрь (сила, не смещение — честная физика)
        if (mForce > 0) {
          const px = this.hproj[i * 3] + dx;
          const py = this.hproj[i * 3 + 1] + dy;
          const mdx = px - this.pointer.x;
          const mdy = py - this.pointer.y;
          const md = Math.hypot(mdx, mdy);
          if (md < Rp && md > 1) {
            const f = (1 - md / Rp) * mForce * dt;
            const ux = mdx / md, uy = mdy / md;
            vx += ux * f + -uy * f * CFG.swirlRatio;
            vy += uy * f + ux * f * CFG.swirlRatio;
          }
        }
        // ударные волны: импульс в кольце
        for (let wI = 0; wI < 3; wI++) {
          const amp = waveU[wI * 4 + 3];
          if (amp <= 0) continue;
          const px = this.hproj[i * 3] + dx;
          const py = this.hproj[i * 3 + 1] + dy;
          const wdx = px - waveU[wI * 4];
          const wdy = py - waveU[wI * 4 + 1];
          const wr = Math.hypot(wdx, wdy) + 0.0001;
          const band = Math.exp(-Math.pow(wr - waveU[wI * 4 + 2], 2) / 1100);
          const kick = band * CFG.waveKick * (waveU[wI * 4 + 3] / CFG.waveAmpDust) * dt;
          vx += (wdx / wr) * kick;
          vy += (wdy / wr) * kick;
        }
        // интеграция + демпфирование + предел
        vx *= damp; vy *= damp;
        let ndx = dx + vx * dt;
        let ndy = dy + vy * dt;
        const dl = Math.hypot(ndx, ndy);
        if (dl > CFG.maxDisp) {
          ndx = (ndx / dl) * CFG.maxDisp;
          ndy = (ndy / dl) * CFG.maxDisp;
        }
        this.vel[i * 2] = vx;
        this.vel[i * 2 + 1] = vy;
        this.disp[i * 2] = ndx;
        this.disp[i * 2 + 1] = ndy;
      }

      if (this.pointer.active && introGate > 0.5 && this.moveAcc >= CFG.moveSpawnPx) {
        this.moveAcc = 0;
        this.spawnNearPointer(Rp * 0.7);
      }

      this.nextPacket -= dt;
      if (this.nextPacket <= 0 && this.introT > 0.5) {
        this.spawnPacket();
        const [lo, hi] = CFG.packetEvery;
        this.nextPacket =
          (lo + this.rand() * (hi - lo)) * (this.degraded ? 2 : 1) * (1 - this.hoverAmt * 0.4);
      }
      for (let i = this.packets.length - 1; i >= 0; i--) {
        const p = this.packets[i];
        p.t += dt / CFG.packetLife;
        if (p.t >= 1) {
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

    // позиции узлов = дом + физическое смещение
    // — линии-синапсы + импульсы —
    let o = 0;
    const L2 = this.links.length / 2;
    const linkFade = 0.25 + 0.75 * this.introT;
    for (let li = 0; li < L2; li++) {
      const a = this.links[li * 2], b = this.links[li * 2 + 1];
      const ax = this.hproj[a * 3] + this.disp[a * 2];
      const ay = this.hproj[a * 3 + 1] + this.disp[a * 2 + 1];
      const bx = this.hproj[b * 3] + this.disp[b * 2];
      const by = this.hproj[b * 3 + 1] + this.disp[b * 2 + 1];
      const za = this.hproj[a * 3 + 2], zb = this.hproj[b * 3 + 2];
      const df = 0.5 + 0.5 * ((za + zb) * 0.25 + 0.5);
      const alpha = this.linkAl[li] * df * linkFade;
      this.linArr[o++] = ax; this.linArr[o++] = ay;
      this.linArr[o++] = alpha;
      this.linArr[o++] = this.col[a * 3]; this.linArr[o++] = this.col[a * 3 + 1]; this.linArr[o++] = this.col[a * 3 + 2];
      this.linArr[o++] = bx; this.linArr[o++] = by;
      this.linArr[o++] = alpha;
      this.linArr[o++] = this.col[b * 3]; this.linArr[o++] = this.col[b * 3 + 1]; this.linArr[o++] = this.col[b * 3 + 2];
    }
    for (const p of this.packets) {
      const a = p.a, b = p.b;
      const ax = this.hproj[a * 3] + this.disp[a * 2];
      const ay = this.hproj[a * 3 + 1] + this.disp[a * 2 + 1];
      const bx = this.hproj[b * 3] + this.disp[b * 2];
      const by = this.hproj[b * 3 + 1] + this.disp[b * 2 + 1];
      const t0 = Math.max(0, p.t - 0.22);
      const x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0;
      const x1 = ax + (bx - ax) * p.t, y1 = ay + (by - ay) * p.t;
      const al = Math.sin(p.t * Math.PI);
      const br = 1.6;
      this.linArr[o++] = x0; this.linArr[o++] = y0; this.linArr[o++] = al * 0.65;
      this.linArr[o++] = Math.min(1, this.col[a * 3] * br); this.linArr[o++] = Math.min(1, this.col[a * 3 + 1] * br); this.linArr[o++] = Math.min(1, this.col[a * 3 + 2] * br);
      this.linArr[o++] = x1; this.linArr[o++] = y1; this.linArr[o++] = al;
      this.linArr[o++] = Math.min(1, this.col[b * 3] * br); this.linArr[o++] = Math.min(1, this.col[b * 3 + 1] * br); this.linArr[o++] = Math.min(1, this.col[b * 3 + 2] * br);
    }
    gl.useProgram(this.linProg);
    gl.uniform2f(gl.getUniformLocation(this.linProg, "uRes"), this.w, this.h);
    gl.bindVertexArray(this.linVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.linBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.linArr.subarray(0, o), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, o / 6);
    gl.bindVertexArray(null);

    // — GPU-пыль (круглые частицы) —
    gl.useProgram(this.cloudProg);
    gl.uniform2f(this.cloudU.uRes, this.w, this.h);
    gl.uniform2f(this.cloudU.uCenter, cx, cy);
    gl.uniform1f(this.cloudU.uR, R);
    gl.uniform4f(this.cloudU.uRot, cyw, syw, cpt, spt);
    gl.uniform1f(this.cloudU.uBreath, breath);
    gl.uniform1f(this.cloudU.uT, this.t);
    gl.uniform1f(this.cloudU.uIntro, this.introT);
    gl.uniform1f(this.cloudU.uDpr, this.dpr);
    const mStr =
      (this.pointer.active ? 1 : 0) *
      introGate *
      (0.7 + Math.min(1, this.ptrSpeed / 700) * 0.6);
    gl.uniform4f(this.cloudU.uMouse, this.pointer.x, this.pointer.y, CFG.pointerR * m, mStr);
    gl.uniform4fv(this.cloudU.uWaves, waveU);
    gl.bindVertexArray(this.cloudVao);
    gl.drawArrays(gl.POINTS, 0, this.cloudDrawN);
    gl.bindVertexArray(null);

    // — узлы-нейроны + ambient (яркие точки поверх) —
    let q = 0;
    for (let i = 0; i < this.n; i++) {
      const depth = this.hproj[i * 3 + 2];
      const df = 0.58 + 0.42 * (depth * 0.5 + 0.5);
      const tw = 0.78 + 0.22 * Math.sin(this.t * 1.9 + this.ph[i] * 2);
      // скорость подсвечивает узел — физика видна светом
      const sp = Math.hypot(this.vel[i * 2], this.vel[i * 2 + 1]);
      const ex = Math.min(1, sp / 260);
      this.ptsArr[q++] = this.hproj[i * 3] + this.disp[i * 2];
      this.ptsArr[q++] = this.hproj[i * 3 + 1] + this.disp[i * 2 + 1];
      this.ptsArr[q++] = this.nsz[i] * df * (1 + ex * 0.35);
      this.ptsArr[q++] = Math.min(1, (0.5 + 0.3 * tw) * df * (0.15 + 0.85 * this.introT) * (1 + ex * 0.9));
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
      this.ptsArr[q++] = this.aAl[i] * tw * this.introT;
      this.ptsArr[q++] = this.aCol[i * 3];
      this.ptsArr[q++] = this.aCol[i * 3 + 1];
      this.ptsArr[q++] = this.aCol[i * 3 + 2];
    }
    gl.useProgram(this.ptsProg);
    gl.uniform2f(gl.getUniformLocation(this.ptsProg, "uRes"), this.w, this.h);
    gl.bindVertexArray(this.ptsVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.ptsArr.subarray(0, q), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, q / 7);
    gl.bindVertexArray(null);
  }
}
