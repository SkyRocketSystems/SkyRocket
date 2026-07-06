import type { StarFieldLike } from './logo-animator';

/* =============================================================
   FUNCIONES DE EASING (solo las que usa el motor de secciones)
============================================================ */
const easeInCubic = (t: number): number => t * t * t;
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const lerp = (a: number, b: number, n: number): number => a + (b - a) * n;

interface Pt {
  x: number;
  y: number;
}

/* =============================================================
   ESTADO Y OBJETIVOS — solo secciones (el hero lo maneja LogoAnimator)
============================================================ */
interface AnimState {
  sparkOpacity: number;
  cornerProgress: number;
  starSectionX: number;
  starSectionY: number;
  starSectionRot: number;
  sec1Opacity: number;
  sec2Opacity: number;
  sec3Opacity: number;
  finalLogoOpacity: number;
}

/* =============================================================
   MOTOR DE SCROLL — solo secciones
============================================================ */
export class ScrollEngine {
  private readonly root: HTMLElement;

  private readonly sectionStar: HTMLElement | null;
  private readonly sectionStarPath: SVGPathElement | null;

  private readonly LERP_FACTOR = 0.09;

  private readonly isMobile: boolean;
  private readonly initialLogoW: number;
  private readonly initialLogoH: number;
  private readonly viewCenterX: number;
  private readonly viewCenterY: number;
  private readonly logoStarSz0: number;
  private readonly finalStarW: number;
  private readonly secA_CX: number;
  private readonly secB_CX: number;
  private readonly secCY: number;
  private readonly mA: Pt;
  private readonly mB: Pt;
  private readonly mC: Pt;

  private state: AnimState;
  private target: AnimState;

  private needsRecalc = false;
  private sectionActive = false;
  private frozenStarCp = 0;

  private rafId = 0;

  constructor(_starfield: StarFieldLike) {
    this.root = document.documentElement;

    this.sectionStar = document.querySelector<HTMLElement>('.section-star');
    this.sectionStarPath = this.sectionStar?.querySelector('path') ?? null;

    this.isMobile = window.innerWidth < 768;
    this.initialLogoW = Math.max(150, Math.min(window.innerWidth * 0.6, 325));
    this.initialLogoH = (this.initialLogoW * 426) / 325;
    this.viewCenterX = window.innerWidth / 2;
    this.viewCenterY = window.innerHeight / 2;
    this.logoStarSz0 = (35 / 325) * this.initialLogoW;

    this.finalStarW = window.innerWidth * (this.isMobile ? 1.05 : 0.85);
    this.secA_CX = window.innerWidth * 0.725;
    this.secB_CX = window.innerWidth * 0.275;
    this.secCY = window.innerHeight * 0.4;
    this.mA = { x: window.innerWidth * 0.78, y: window.innerHeight * 0.28 };
    this.mB = { x: window.innerWidth * 0.22, y: window.innerHeight * 0.72 };
    this.mC = { x: window.innerWidth * 0.22, y: window.innerHeight * 0.28 };

    this.state = {
      sparkOpacity: 1,
      cornerProgress: 0,
      starSectionX: this.isMobile ? this.mA.x : this.secA_CX,
      starSectionY: this.isMobile ? this.mA.y : this.secCY,
      starSectionRot: 0,
      sec1Opacity: 0,
      sec2Opacity: 0,
      sec3Opacity: 0,
      finalLogoOpacity: 0,
    };
    this.target = { ...this.state };
  }

  /* --------------------------------------------------------- */
  /* CÁLCULO DE OBJETIVOS POR SCROLL                           */
  /* --------------------------------------------------------- */
  private calcularObjetivo(): void {
    const rawScrollY = window.scrollY;
    const totalPx = document.body.scrollHeight - window.innerHeight;

    const HERO_MAX_PX = 2 * window.innerHeight;
    const sectionPx = Math.max(totalPx - HERO_MAX_PX, 1);
    const sectionScroll = Math.min(
      Math.max((rawScrollY - HERO_MAX_PX) / sectionPx, 0),
      1,
    );

    // ── SECCIONES ──
    const transP = easeInOutCubic(Math.min(sectionScroll / 0.25, 1));
    this.target.cornerProgress = transP;

    if (this.isMobile) {
      if (sectionScroll >= 0.8) {
        this.target.starSectionX = this.mC.x;
        this.target.starSectionY = this.mC.y;
        this.target.starSectionRot = 0;
      } else if (sectionScroll >= 0.5) {
        this.target.starSectionX = this.mB.x;
        this.target.starSectionY = this.mB.y;
        this.target.starSectionRot = 45;
      } else {
        this.target.starSectionX = this.mA.x;
        this.target.starSectionY = this.mA.y;
        this.target.starSectionRot = 0;
      }
    } else {
      if (sectionScroll >= 0.8) {
        this.target.starSectionX = this.secA_CX;
        this.target.starSectionRot = 0;
      } else if (sectionScroll >= 0.5) {
        this.target.starSectionX = this.secB_CX;
        this.target.starSectionRot = 45;
      } else {
        this.target.starSectionX = this.secA_CX;
        this.target.starSectionRot = 0;
      }
      this.target.starSectionY = this.secCY;
    }

    // Swap instantáneo del logo-star ↔ section-star
    if (sectionScroll > 0.005) {
      if (!this.sectionActive) {
        this.sectionActive = true;
        this.state.sparkOpacity = 0;
      }
      this.target.sparkOpacity = 0;
    } else {
      if (this.sectionActive) {
        this.sectionActive = false;
        this.state.sparkOpacity = 1;
      }
      this.target.sparkOpacity = 1;
    }

    // Opacidad de las secciones
    const s1In = easeOutCubic(Math.min((sectionScroll - 0.25) / 0.08, 1));
    const s1Out = easeInCubic(Math.max((sectionScroll - 0.43) / 0.05, 0));
    this.target.sec1Opacity = Math.max(s1In - s1Out, 0);

    const s2In = easeOutCubic(Math.min((sectionScroll - 0.55) / 0.08, 1));
    const s2Out = easeInCubic(Math.max((sectionScroll - 0.73) / 0.05, 0));
    this.target.sec2Opacity = Math.max(s2In - s2Out, 0);

    const s3In = easeOutCubic(Math.min((sectionScroll - 0.82) / 0.08, 1));
    const s3Out = easeInCubic(Math.max((sectionScroll - 0.88) / 0.04, 0));
    this.target.sec3Opacity = Math.max(s3In - s3Out, 0);

    // Sección final
    const finalP = easeOutCubic(
      Math.min(Math.max(sectionScroll - 0.92, 0) / 0.08, 1),
    );
    this.target.finalLogoOpacity = finalP;
    if (sectionScroll >= 0.88) {
      const revP = easeInOutCubic(Math.min((sectionScroll - 0.88) / 0.08, 1));
      this.target.cornerProgress = 1 - revP;
    }
    if (finalP > 0) {
      this.target.sparkOpacity = finalP;
    }

    // Reset instantáneo al salir de la zona final (scroll hacia arriba)
    if (sectionScroll < 0.86 && this.state.finalLogoOpacity > 0.01) {
      this.state.finalLogoOpacity = 0;
      this.target.finalLogoOpacity = 0;
      this.state.sparkOpacity = 0;
      this.frozenStarCp = 1;
    }

    this.needsRecalc = false;
  }

  private onScroll = (): void => {
    if (!this.needsRecalc) {
      this.needsRecalc = true;
      requestAnimationFrame(() => this.calcularObjetivo());
    }
  };

  /* --------------------------------------------------------- */
  /* LOOP DE ANIMACIÓN                                         */
  /* --------------------------------------------------------- */
  private animar = (): void => {
    const s = this.state;
    const t = this.target;
    const k = this.LERP_FACTOR;

    s.sparkOpacity = lerp(s.sparkOpacity, t.sparkOpacity, k);
    s.cornerProgress = lerp(s.cornerProgress, t.cornerProgress, k);
    s.starSectionX = lerp(s.starSectionX, t.starSectionX, k);
    s.starSectionY = lerp(s.starSectionY, t.starSectionY, k);
    s.starSectionRot = lerp(s.starSectionRot, t.starSectionRot, k);
    s.sec1Opacity = lerp(s.sec1Opacity, t.sec1Opacity, k);
    s.sec2Opacity = lerp(s.sec2Opacity, t.sec2Opacity, k);
    s.sec3Opacity = lerp(s.sec3Opacity, t.sec3Opacity, k);
    s.finalLogoOpacity = lerp(s.finalLogoOpacity, t.finalLogoOpacity, k);

    const r = this.root.style;

    // spark-opacity se comparte con LogoAnimator (que controla el resto del hero)
    r.setProperty('--spark-opacity', String(s.sparkOpacity));
    r.setProperty('--sec1-opacity', String(s.sec1Opacity));
    r.setProperty('--sec2-opacity', String(s.sec2Opacity));
    r.setProperty('--sec3-opacity', String(s.sec3Opacity));
    r.setProperty('--final-logo-opacity', String(s.finalLogoOpacity));

    // ── Posicionamiento del logo container ──
    const cp = s.cornerProgress;
    const fp = s.finalLogoOpacity;

    if (this.sectionActive) {
      if (fp > 0) {
        this.frozenStarCp = 1 - fp;
      } else {
        this.frozenStarCp = Math.max(this.frozenStarCp, cp);
      }
    } else {
      this.frozenStarCp = 0;
    }

    const logoW = this.initialLogoW * (1 - cp) + 46 * cp;
    const logoH = (logoW * 426) / 325;
    const logoTopPx = this.viewCenterY * (1 - cp) + 24 * cp;
    const logoLeftPx = this.viewCenterX * (1 - cp) + 24 * cp;
    const offX = -(this.initialLogoW / 2) * (1 - cp);
    const offY = -(this.initialLogoH / 2) * (1 - cp);

    const finalScale = 1 - fp * 0.3;
    const vertShift = fp * 38;
    const logoTransform = `translate(${offX}px, ${offY - vertShift}px) scale(${finalScale})`;

    r.setProperty('--logo-top', `${logoTopPx}px`);
    r.setProperty('--logo-left', `${logoLeftPx}px`);
    r.setProperty('--logo-transform', logoTransform);
    r.setProperty('--logo-width', `${logoW}px`);

    const logoCenterX = logoLeftPx + offX + logoW / 2;
    const logoCenterY = logoTopPx + offY - vertShift + logoH / 2;
    const visLogoH = logoH * finalScale;
    r.setProperty('--final-text-top', `${logoCenterY + visLogoH / 2 + 10}px`);
    r.setProperty('--final-text-left', `${logoCenterX}px`);
    r.setProperty('--final-text-width', `${logoW * finalScale}px`);
    r.setProperty('--final-text-opacity', String(fp));

    // ── Estrella decorativa de sección ──
    if (this.sectionStar) {
      const scp = this.frozenStarCp;
      const starDX = (226 / this.initialLogoW - 0.5) * logoW;
      const starDY = (17 / this.initialLogoH - 0.5) * logoH;
      const destX = logoCenterX + starDX * finalScale;
      const destY = logoCenterY + starDY * finalScale;
      const destSz = this.logoStarSz0 * finalScale;

      const sW = destSz + (this.finalStarW - destSz) * scp;
      const sCX = destX + (s.starSectionX - destX) * scp;
      const sCY = destY + (s.starSectionY - destY) * scp;

      this.sectionStar.style.width = `${sW}px`;
      this.sectionStar.style.height = `${sW}px`;
      this.sectionStar.style.left = `${sCX - sW / 2}px`;
      this.sectionStar.style.top = `${sCY - sW / 2}px`;
      this.sectionStar.style.right = 'auto';
      this.sectionStar.style.transform = `rotate(${scp * 18 + s.starSectionRot}deg)`;
      this.sectionStar.style.opacity = this.sectionActive
        ? String(Math.min(scp * 5, 1))
        : '0';

      if (this.sectionStarPath) {
        const colorP = Math.max((scp - 0.7) / 0.3, 0);
        const cr = Math.round(254 + (3 - 254) * colorP);
        const cg = Math.round(163 + (13 - 163) * colorP);
        const cb = Math.round(20 + (30 - 20) * colorP);
        this.sectionStarPath.style.fill = `rgb(${cr},${cg},${cb})`;
        this.sectionStarPath.style.strokeOpacity = String(colorP);
      }
    }

    this.rafId = requestAnimationFrame(this.animar);
  };

  /* --------------------------------------------------------- */
  /* CICLO DE VIDA                                             */
  /* --------------------------------------------------------- */
  start(): void {
    window.addEventListener('scroll', this.onScroll, { passive: true });
    this.calcularObjetivo();
    this.rafId = requestAnimationFrame(this.animar);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('scroll', this.onScroll);
  }
}