/* =============================================================
   FUNCIONES DE EASING
============================================================ */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const lerp = (a: number, b: number, n: number): number => a + (b - a) * n;

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
const START: Pt = STAR_PATH[0];

/**
 * LogoAnimator
 * -----------
 * Runs the hero logo intro animation (the star traveling along the S path,
 * the trail revealing, the clip wipe and glow) on its OWN requestAnimationFrame
 * loop, completely independent of the page scroll. This plays once on load.
 *
 * It writes the same set of CSS custom properties on :root that the original
 * scroll-driven hero used, so the existing CSS (clip-path, stroke-dashoffset,
 * transform, opacity) keeps working unchanged.
 *
 * The animation has three phases mirroring the original hero timeline:
 *   - Phase 1 (0 → ARRIVAL): star travels the path, trail draws, S fades out.
 *   - Phase 2 (ARRIVAL → ARRIVAL+settle): logo fully revealed, glow ramps up,
 *     ignition flash + shockwave fire at the arrival instant.
 *   - Idle thereafter: holds the final state. The page's scroll engine takes
 *     over the same CSS vars once the user starts scrolling.
 */
export class LogoAnimator {
  private readonly root: HTMLElement;
  private readonly ignitionFx: HTMLElement | null;
  private readonly spark: SVGElement | null;
  private readonly starfield: StarFieldLike;

  /** Progress of the intro animation, 0 → 1. */
  private progress = 0;
  /** Wall-clock seconds for phase 1 (the travel). */
  private readonly travelDuration: number;
  /** Wall-clock seconds for phase 2 (settle after arrival). */
  private readonly settleDuration = 0.8;
  /** Hero "arrival" point (0.30 in the original hero timeline). */
  private readonly ARRIVAL = 0.3;

  private rafId = 0;
  private lastTs = 0;
  private phase: 'travel' | 'settle' | 'idle' = 'travel';
  private arrived = false;

  constructor(starfield: StarFieldLike, travelDuration = 2.4) {
    this.root = document.documentElement;
    this.starfield = starfield;
    this.travelDuration = travelDuration;

    this.ignitionFx = document.getElementById('ignition-fx');
    this.spark = document.querySelector<SVGElement>('.layer-estrella');

    // Hold the pre-animation state on :root so the page renders correctly
    // before the first frame.
    this.applyPhase0();
  }

  /** Pin the initial (pre-trigger) frame: star hidden, S fully visible. */
  private applyPhase0(): void {
    const r = this.root.style;
    const p = puntoEnTrayectoria(0);
    r.setProperty('--star-dx', String(p.x - REST.x));
    r.setProperty('--star-dy', String(p.y - REST.y));
    r.setProperty('--spark-scale', '0.7');
    r.setProperty('--spark-rot', '0deg');
    r.setProperty('--spark-opacity', '0');
    r.setProperty('--trail-progress', '0');
    r.setProperty('--logo-clip-y', String(p.y));
    r.setProperty('--s-opacity', '1');
    r.setProperty('--logo-opacity', '1');
    r.setProperty('--bg-glow', '0');
  }

  start(): void {
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
  }

  /** True once the intro has finished and control can pass to scroll. */
  get done(): boolean {
    return this.phase === 'idle';
  }

  private tick = (ts: number): void => {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000); // clamp to avoid jumps
    this.lastTs = ts;

    if (this.phase === 'travel') {
      this.progress += dt / this.travelDuration;
      if (this.progress >= this.ARRIVAL) {
        this.progress = this.ARRIVAL;
        this.phase = 'settle';
        this.fireArrival();
      }
      this.renderTravel(this.progress / this.ARRIVAL);
    } else if (this.phase === 'settle') {
      // Ease the remaining glow/scale settle across settleDuration.
      const t = Math.min(1, (this.progress - this.ARRIVAL) / 0.0001);
      // Simpler: just animate a local settle variable.
      this.settleElapsed = (this.settleElapsed ?? 0) + dt;
      const s = Math.min(1, this.settleElapsed / this.settleDuration);
      this.renderSettle(s);
      if (s >= 1) {
        this.phase = 'idle';
      }
    }

    if (this.phase !== 'idle') {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };

  private settleElapsed: number | undefined;

  private renderTravel(t: number): void {
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
    r.setProperty('--s-opacity', String(1 - easeOutCubic(Math.min(t / 1.5, 1))));
    r.setProperty('--bg-glow', String(e * 0.3));
  }

  private renderSettle(t: number): void {
    const e = easeInOutCubic(t);
    const r = this.root.style;
    // Star snaps to rest, trail fully drawn, glow ramps to full.
    r.setProperty('--star-dx', '0');
    r.setProperty('--star-dy', '0');
    r.setProperty('--spark-opacity', '1');
    r.setProperty('--spark-scale', String(1 + (1 - e) * 0.2));
    r.setProperty('--spark-rot', '360deg');
    r.setProperty('--trail-progress', '1');
    r.setProperty('--logo-clip-y', String(REST.y));
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