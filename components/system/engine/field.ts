// Живое поле v8-dark — чистый WebGL2, без three (бюджет JS).
// Скин v7: сеть узлов-связей (костяной свет на тёмном) + сигнальные
// «пакеты» по линиям + тяга к курсору. Энсо-штриха в этом варианте НЕТ
// (решение владельца): сигнатура — сама живая сеть. `reseed` честно
// пересобирает созвездие (новые «дома» узлов, плавная миграция).
//
// Перф-дисциплина: собственный аккумулятор времени (не wall-clock),
// пауза на hidden/blur/вне вьюпорта, авто-даунгрейд по замеру FPS.

import { mulberry32 } from "@/lib/seed";

const INK = [0.855, 0.839, 0.8] as const; // костяной свет узлов/линий (v7)
const RED = [0, 0.878, 0.541] as const; // сигнальный зелёный: пакеты = свет (v7)

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
  lowFps: 45,
};

type Node = {
  hx: number; hy: number; // дом (доля вьюпорта)
  x: number; y: number;
  ph: number; // фаза дрейфа
  sz: number;
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

    const gl = canvas.getContext("webgl2", { alpha: true, antialias: true });
    if (!gl) throw new Error("webgl2-unavailable");
    this.gl = gl;

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
      // статика: сеть замерла в красивую структуру — один кадр
      this.renderOnce();
    } else {
      this.start();
    }
  }

  // ---------- публичное ----------

  /** Пересобрать созвездие (терминал: enso --reseed): новые «дома» узлов,
   *  существующие плавно мигрируют к ним + импульс пакетов. */
  reseed(seed: number) {
    this.rand = mulberry32(seed);
    for (const nd of this.nodes) {
      nd.hx = this.rand();
      nd.hy = this.rand();
      nd.ph = this.rand() * Math.PI * 2;
    }
    this.burst();
    if (this.reduced) {
      for (const nd of this.nodes) {
        nd.x = nd.hx;
        nd.y = nd.hy;
      }
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
    gl.deleteProgram(this.ptsProg);
    gl.deleteProgram(this.linProg);
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

    this.ptsProg = this.program(vsPts, fsPts);
    this.linProg = this.program(vsLin, fsLin);
    this.ptsBuf = gl.createBuffer()!;
    this.linBuf = gl.createBuffer()!;

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
      });
    }
    this.ptsArr = new Float32Array(n * 5);
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
    if (this.degraded) return;
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

    for (const nd of nodes) {
      // фоновый дрейф вокруг дома
      const dx = Math.sin(this.t * 0.4 + nd.ph) * CFG.drift;
      const dy = Math.cos(this.t * 0.33 + nd.ph * 1.3) * CFG.drift;
      let tx = nd.hx + (dx * m) / this.w;
      let ty = nd.hy + (dy * m) / this.h;

      // тяга курсора
      if (this.pointer.active) {
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
    if (this.nextPacket <= 0 && this.links.length) {
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
    // пакеты: короткий сигнальный сегмент, бегущий по линии
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
