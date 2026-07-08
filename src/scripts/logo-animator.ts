/* =============================================================
   FUNCIONES DE EASING
============================================================ */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

interface Pt {
  x: number;
  y: number;
}

/* =============================================================
   TRAYECTORIA DE LA ESTRELLA DEL LOGO
============================================================ */
const STAR_PATH: Pt[] = [
  { x: 150, y: 475 },
  { x: 150, y: 425 },
  { x: 123, y: 380 },
  { x: 114, y: 320 },
  { x: 120, y: 260 },
  { x: 136, y: 200 },
  { x: 161, y: 140 },
  { x: 226, y: 17 },
];

function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t;
  const t3 = t2 * t;
  const x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  const y =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  return { x, y };
}

function puntoEnTrayectoria(t: number): Pt {
  const pts = STAR_PATH;
  const nSeg = pts.length - 1;
  let segF = t * nSeg;
  let seg = Math.floor(segF);
  if (seg >= nSeg) seg = nSeg - 1;
  const localT = segF - seg;
  return catmullRom(
    pts[Math.max(seg - 1, 0)],
    pts[seg],
    pts[seg + 1],
    pts[Math.min(seg + 2, nSeg)],
    localT,
  );
}

const REST: Pt = STAR_PATH[STAR_PATH.length - 1];

/**
 * LogoAnimator
 * -----------
 * Phase sequence (all on its own RAF loop, independent of scroll):
 *
 *   draw   (0.8s)  — text "S" reveals top→bottom via clip-path
 *   idle          — holds until trigger() is called by the scroll engine
 *   undraw (0.4s) — text "S" erases top→bottom; SVG S crossfades in
 *   travel (2.4s) — spark follows the path, trail draws, glow ramps
 *   settle (0.8s) — arrival flash + shockwave, glow to full
 *   done          — idle, scroll engine owns the page
 */
export class LogoAnimator {
  private readonly root: HTMLElement;
  private readonly ignitionFx: HTMLElement | null;
  private readonly spark: SVGElement | null;
  private readonly starfield: StarFieldLike;

  private readonly drawDuration = 0.8;
  private readonly undrawDuration = 0.4;
  private readonly travelDuration = 2.4;
  private readonly settleDuration = 0.8;
  private readonly ARRIVAL = 0.3;

  private rafId = 0;
  private lastTs = 0;
  private phase: 'draw' | 'idle' | 'undraw' | 'travel' | 'settle' | 'done' =
    'draw';
  private phaseTime = 0;
  private travelProgress = 0;
  private arrived = false;

  constructor(starfield: StarFieldLike) {
    this.root = document.documentElement;
    this.starfield = starfield;
    this.ignitionFx = document.getElementById('ignition-fx');
    this.spark = document.querySelector<SVGElement>('.layer-estrella');
    this.applyIdleState();
  }

  /** Called by the scroll engine when scroll crosses the 10px threshold. */
  trigger(): void {
    if (this.phase === 'idle') {
      this.phase = 'undraw';
      this.phaseTime = 0;
      this.ensureRaf();
    }
  }

  start(): void {
    this.phase = 'draw';
    this.phaseTime = 0;
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
  }

  // ────────────────────────────────────────────
  //  Initial CSS state
  // ────────────────────────────────────────────
  private applyIdleState(): void {
    const r = this.root.style;
    r.setProperty('--s-clip', '0%');
    r.setProperty('--s-text-opacity', '1');
    r.setProperty('--s-svg-opacity', '0');
    r.setProperty('--spark-opacity', '0');
    r.setProperty('--spark-scale', '0.7');
    r.setProperty('--spark-rot', '0deg');
    r.setProperty('--star-dx', '0');
    r.setProperty('--star-dy', '0');
    r.setProperty('--trail-progress', '0');
    r.setProperty('--logo-clip-y', String(REST.y));
    r.setProperty('--bg-glow', '0');
  }

  // ────────────────────────────────────────────
  //  RAF loop
  // ────────────────────────────────────────────
  private ensureRaf(): void {
    if (this.rafId === 0) {
      this.lastTs = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  private tick = (ts: number): void => {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.phaseTime += dt;

    switch (this.phase) {
      case 'draw':
        this.renderDraw();
        if (this.phaseTime >= this.drawDuration) {
          this.phase = 'idle';
          this.rafId = 0;
          return; // stop looping until trigger()
        }
        break;
      case 'undraw':
        this.renderUndraw();
        if (this.phaseTime >= this.undrawDuration) {
          this.phase = 'travel';
          this.phaseTime = 0;
          this.travelProgress = 0;
        }
        break;
      case 'travel':
        this.travelProgress += dt / this.travelDuration;
        if (this.travelProgress >= this.ARRIVAL) {
          this.travelProgress = this.ARRIVAL;
          this.phase = 'settle';
          this.phaseTime = 0;
          this.fireArrival();
        }
        this.renderTravel();
        break;
      case 'settle':
        this.renderSettle();
        if (this.phaseTime >= this.settleDuration) {
          this.phase = 'done';
          this.rafId = 0;
          return;
        }
        break;
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  // ────────────────────────────────────────────
  //  Phase renderers
  // ────────────────────────────────────────────
  private renderDraw(): void {
    const t = Math.min(1, this.phaseTime / this.drawDuration);
    const e = easeInOutCubic(t);
    this.root.style.setProperty('--s-clip', `${e * 100}%`);
  }

  private renderUndraw(): void {
    const t = Math.min(1, this.phaseTime / this.undrawDuration);
    const e = easeInOutCubic(t);
    // Text S erases top→bottom: clip goes 100%→0
    this.root.style.setProperty('--s-clip', `${(1 - e) * 100}%`);
    this.root.style.setProperty('--s-text-opacity', String(1 - e));
    this.root.style.setProperty('--s-svg-opacity', String(e));
    // Prep the spark at the start of the path
    const p = puntoEnTrayectoria(0);
    this.root.style.setProperty('--star-dx', String(p.x - REST.x));
    this.root.style.setProperty('--star-dy', String(p.y - REST.y));
  }

  private renderTravel(): void {
    const t = this.travelProgress / this.ARRIVAL;
    const e = easeInOutCubic(t);
    const p = puntoEnTrayectoria(e);
    const r = this.root.style;
    r.setProperty('--star-dx', String(p.x - REST.x));
    r.setProperty('--star-dy', String(p.y - REST.y));
    r.setProperty('--spark-opacity', String(Math.min(t / 0.4, 1)));
    r.setProperty('--spark-scale', String(0.7 + e * 0.3));
    r.setProperty('--spark-rot', `${e * 360}deg`);
    r.setProperty('--trail-progress', String(e));
    r.setProperty('--logo-clip-y', String(p.y));
    r.setProperty('--bg-glow', String(e * 0.3));
  }

  private renderSettle(): void {
    const t = Math.min(1, this.phaseTime / this.settleDuration);
    const e = easeInOutCubic(t);
    const r = this.root.style;
    r.setProperty('--star-dx', '0');
    r.setProperty('--star-dy', '0');
    r.setProperty('--spark-opacity', '1');
    r.setProperty('--spark-scale', String(1 + (1 - e) * 0.2));
    r.setProperty('--spark-rot', '360deg');
    r.setProperty('--trail-progress', '1');
    r.setProperty('--bg-glow', String(0.3 + e * 0.7));
  }

  private fireArrival(): void {
    if (this.arrived) return;
    this.arrived = true;
    this.ignitionFx?.classList.add('fire');
    this.spark?.classList.add('kick');
    window.setTimeout(() => {
      this.ignitionFx?.classList.remove('fire');
      this.spark?.classList.remove('kick');
    }, 800);
    this.starfield.triggerShockwave();
  }
}

/** Structural subset of StarField that the animator needs. */
export interface StarFieldLike {
  triggerShockwave(): void;
  resetShockwave(): void;
}