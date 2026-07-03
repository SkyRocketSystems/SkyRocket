document.addEventListener('DOMContentLoaded', () => {
    crearEstrellas();
    iniciarMotorScroll();
});

/* =============================================================
   CAMPO DE ESTRELLAS DE FONDO
   Genera divs con tamaño, posición y animación aleatorios.
   Todos los parámetros se guardan como CSS custom properties.
   Cantidad: 150 en PC, 100 en móvil.
============================================================= */
function crearEstrellas() {
    const contenedor = document.getElementById('star-container');
    const numStars   = window.innerWidth >= 768 ? 150 : 100;

    for (let i = 0; i < numStars; i++) {
        const star = document.createElement('div');
        star.classList.add('star');

        const size          = Math.random() * 1 + 5;
        const left          = Math.random() * 100;
        const moveDuration  = Math.random() * 30 + 20;
        const moveDelay     = -(Math.random() * moveDuration);
        const blinkDuration = Math.random() * 1.5 + 0.5;
        const blinkDelay    = Math.random() * 2;
        const orbitR        = Math.random() * (Math.sqrt(Math.pow(window.innerWidth/2,2)+Math.pow(window.innerHeight/2,2)) - 80) + 80;
        const orbitDuration = Math.random() * 17 + 8;

        star.style.width  = `${size}px`;
        star.style.height = `${size}px`;
        star.style.left   = `${left}vw`;
        star.dataset.origLeft    = `${left}vw`;
        star.dataset.orbitR      = orbitR;
        star.dataset.orbitDuration = orbitDuration;

        star.style.setProperty('--move-duration',  `${moveDuration}s`);
        star.style.setProperty('--move-delay',     `${moveDelay}s`);
        star.style.setProperty('--blink-duration', `${blinkDuration}s`);
        star.style.setProperty('--blink-delay',    `${blinkDelay}s`);

        contenedor.appendChild(star);
    }
}

/* =============================================================
   FUNCIONES DE EASING
============================================================= */
const easeInCubic    = t => t * t * t;
const easeOutCubic   = t => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;

/* =============================================================
   TRAYECTORIA DE LA ESTRELLA DEL LOGO
   Puntos medidos sobre la geometría real del trazo.
============================================================= */
const STAR_PATH = [
    { x: 150, y: 475 },
    { x: 150, y: 425 },
    { x: 123, y: 380 },
    { x: 114, y: 320 },
    { x: 120, y: 260 },
    { x: 136, y: 200 },
    { x: 161, y: 140 },
    { x: 226, y: 17  },
];

function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t*t, t3 = t2*t;
    const x = 0.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3);
    const y = 0.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3);
    return { x, y };
}

function puntoEnTrayectoria(t) {
    const pts = STAR_PATH, nSeg = pts.length - 1;
    let segF = t * nSeg, seg = Math.floor(segF);
    if (seg >= nSeg) seg = nSeg - 1;
    const localT = segF - seg;
    return catmullRom(
        pts[Math.max(seg-1,0)], pts[seg],
        pts[seg+1], pts[Math.min(seg+2,nSeg)],
        localT
    );
}

/* =============================================================
   MOTOR DE SCROLL
============================================================= */
function iniciarMotorScroll() {
    const root          = document.documentElement;
    const ignitionFx    = document.getElementById('ignition-fx');
    const spark         = document.querySelector('.layer-estrella');
    const starContainer = document.getElementById('star-container');
    const stars         = Array.from(document.querySelectorAll('.star'));
    const sectionStar   = document.querySelector('.section-star');
    const sectionStarPath = sectionStar ? sectionStar.querySelector('path') : null;
    const logoContainer = document.querySelector('.logo-container');

    const LERP_FACTOR      = 0.09;
    const ARRIVAL_AT       = 0.30;
    const ARRIVAL_RESET_AT = 0.28;
    const WAVE_SPEED       = 1200;

    const isMobile   = window.innerWidth < 768;
    const initialLogoW = Math.max(150, Math.min(window.innerWidth * 0.6, 325));
    const initialLogoH = initialLogoW * 426 / 325;
    const viewCenterX  = window.innerWidth  / 2;
    const viewCenterY  = window.innerHeight / 2;
    const centerX      = viewCenterX;
    const centerY      = viewCenterY;
    const maxWaveR     = Math.sqrt(Math.pow(window.innerWidth,2) + Math.pow(window.innerHeight,2));

    // Posición inicial de la estrella del logo en pantalla
    const logoStarCX0 = viewCenterX + initialLogoW * (226/325 - 0.5);
    const logoStarCY0 = viewCenterY + initialLogoH * (17/426  - 0.5);
    const logoStarSz0 = (35/325) * initialLogoW;

    // Posiciones finales de la estrella decorativa por sección
    const finalStarW = window.innerWidth * (isMobile ? 1.05 : 0.85);
    const secA_CX    = window.innerWidth  * 0.725;
    const secB_CX    = window.innerWidth  * 0.275;
    const secCY      = window.innerHeight * 0.40;
    const mA = { x: window.innerWidth*0.78, y: window.innerHeight*0.28 };
    const mB = { x: window.innerWidth*0.22, y: window.innerHeight*0.72 };
    const mC = { x: window.innerWidth*0.22, y: window.innerHeight*0.28 };

    const REST  = STAR_PATH[STAR_PATH.length - 1];
    const START = STAR_PATH[0];

    const state = {
        starDx: START.x - REST.x, starDy: START.y - REST.y,
        sparkScale: 0.7, sparkRot: 0, sparkOpacity: 0,
        trailProgress: 0, logoClipY: START.y,
        sOpacity: 1, logoOpacity: 0, bgGlow: 0,
        cornerProgress: 0,
        starSectionX: isMobile ? mA.x : secA_CX,
        starSectionY: isMobile ? mA.y : secCY,
        starSectionRot: 0,
        sec1Opacity: 0, sec2Opacity: 0, sec3Opacity: 0,
        finalLogoOpacity: 0
    };
    const target = { ...state };

    let needsRecalc  = false;
    let arrived      = false;
    let waveActive   = false;
    let waveStartTime = 0;
    let orbitingCount = 0;
    let sectionActive      = false;
    let frozenStarCp       = 0;  // cp congelado para la estrella de sección
    let wasInFinalSection  = false; // detecta salida de sección final al scroll-back

    /* ---------------------------------------------------------
       CÁLCULO DE OBJETIVOS POR SCROLL
    --------------------------------------------------------- */
    function calcularObjetivo() {
        const rawScrollY = window.scrollY;
        const totalPx    = document.body.scrollHeight - window.innerHeight;

        // heroScroll: 0-1 sobre los primeros 200vh (independiente del tamaño total)
        const HERO_MAX_PX   = 2 * window.innerHeight;
        const heroScroll    = Math.min(rawScrollY / HERO_MAX_PX, 1);

        // sectionScroll: 0-1 sobre el scroll posterior al hero
        const sectionPx     = Math.max(totalPx - HERO_MAX_PX, 1);
        const sectionScroll = Math.min(Math.max((rawScrollY - HERO_MAX_PX) / sectionPx, 0), 1);

        const scroll = heroScroll;

        // ── HERO FASE 1 (0%-30%) ──
        if (scroll < 0.30) {
            const t = easeInOutCubic(scroll / 0.30);
            const p = puntoEnTrayectoria(t);
            target.starDx        = p.x - REST.x;
            target.starDy        = p.y - REST.y;
            target.sparkOpacity  = Math.min(t / 0.12, 1);
            target.sparkScale    = 0.7 + t * 0.3;
            target.sparkRot      = t * 360;
            target.trailProgress = t;
            target.logoClipY     = p.y;
            target.logoOpacity   = 1;
            target.sOpacity      = 1 - easeOutCubic(Math.min(t / 0.45, 1));
            target.bgGlow        = t * 0.3;
        }
        // ── HERO FASE 2 (30%-50%) ──
        else if (scroll < 0.50) {
            const p             = easeInOutCubic((scroll - 0.30) / 0.20);
            target.starDx       = 0; target.starDy = 0;
            target.sparkOpacity = 1;
            target.sparkScale   = 1 + (1 - p) * 0.2;
            target.sparkRot     = 360;
            target.trailProgress = 1;
            target.logoClipY    = REST.y;
            target.logoOpacity  = 1;
            target.sOpacity     = 0;
            target.bgGlow       = 0.3 + p * 0.7;
        }
        // ── HERO FASE 3 (50%-100%) ──
        else {
            target.starDx = 0; target.starDy = 0;
            target.sparkOpacity = 1; target.sparkScale = 1; target.sparkRot = 360;
            target.trailProgress = 1; target.logoClipY = REST.y;
            target.logoOpacity = 1; target.sOpacity = 0; target.bgGlow = 1;
        }

        // ── SECCIONES ──
        const transP = easeInOutCubic(Math.min(sectionScroll / 0.25, 1));
        target.cornerProgress = transP;

        // Posición de la estrella decorativa según sección y dispositivo
        if (isMobile) {
            if (sectionScroll >= 0.80) {
                target.starSectionX = mC.x; target.starSectionY = mC.y;
                target.starSectionRot = 0;
            } else if (sectionScroll >= 0.50) {
                target.starSectionX = mB.x; target.starSectionY = mB.y;
                target.starSectionRot = 45;
            } else {
                target.starSectionX = mA.x; target.starSectionY = mA.y;
                target.starSectionRot = 0;
            }
        } else {
            if (sectionScroll >= 0.80) {
                target.starSectionX = secA_CX; target.starSectionRot = 0;
            } else if (sectionScroll >= 0.50) {
                target.starSectionX = secB_CX; target.starSectionRot = 45;
            } else {
                target.starSectionX = secA_CX; target.starSectionRot = 0;
            }
            target.starSectionY = secCY;
        }

        // Swap instantáneo del logo-star ↔ section-star
        if (sectionScroll > 0.005) {
            if (!sectionActive) { sectionActive = true; state.sparkOpacity = 0; }
            target.sparkOpacity = 0;
        } else {
            if (sectionActive) { sectionActive = false; state.sparkOpacity = 1; }
            target.sparkOpacity = 1;
        }

        // Opacidad de las secciones
        const s1In  = easeOutCubic(Math.min((sectionScroll - 0.25) / 0.08, 1));
        const s1Out = easeInCubic(Math.max((sectionScroll - 0.43) / 0.05, 0));
        target.sec1Opacity = Math.max(s1In - s1Out, 0);

        const s2In  = easeOutCubic(Math.min((sectionScroll - 0.55) / 0.08, 1));
        const s2Out = easeInCubic(Math.max((sectionScroll - 0.73) / 0.05, 0));
        target.sec2Opacity = Math.max(s2In - s2Out, 0);

        const s3In  = easeOutCubic(Math.min((sectionScroll - 0.82) / 0.08, 1));
        const s3Out = easeInCubic(Math.max((sectionScroll - 0.88) / 0.04, 0));
        target.sec3Opacity = Math.max(s3In - s3Out, 0);

        // Sección final (92%-100%): logo regresa al centro y aparece el nombre.
        // El logo vuelve a un tamaño moderado (no el máximo del hero) para que
        // el texto del nombre quede visible dentro de la pantalla.
        const finalP = easeOutCubic(Math.min(Math.max(sectionScroll - 0.92, 0) / 0.08, 1));
        target.finalLogoOpacity = finalP;
        if (sectionScroll >= 0.88) {
            const revP = easeInOutCubic(Math.min((sectionScroll - 0.88) / 0.08, 1));
            target.cornerProgress = 1 - revP; // va hasta 0: logo totalmente centrado
        }
        // La estrella del logo vuelve a aparecer a medida que la estrella de sección
        // regresa a su posición — el sparkOpacity anula el 0 fijado por sectionActive
        if (finalP > 0) {
            target.sparkOpacity = finalP;
        }

        /* Reset instantáneo al salir de la zona final (scroll hacia arriba):
           Si el usuario sube rápido, state.finalLogoOpacity quedaría lerpeando
           lentamente mientras la estrella de sección ya debería estar en su
           posición de sección. Forzando el reset a 0 en un frame se evita el
           estado intermedio que buguea la animación al volver a la sección 1. */
        if (sectionScroll < 0.86 && state.finalLogoOpacity > 0.01) {
            state.finalLogoOpacity = 0;
            target.finalLogoOpacity = 0;
            state.sparkOpacity = 0;  // logo star: ocultar de inmediato
            frozenStarCp = 1;        // section star: volver a posición de sección ya
        }

        // Flash + shockwave al llegar la estrella
        if (scroll >= ARRIVAL_AT && !arrived) {
            arrived = true;
            ignitionFx.classList.add('fire');
            if (spark) spark.classList.add('kick');
            setTimeout(() => {
                ignitionFx.classList.remove('fire');
                if (spark) spark.classList.remove('kick');
            }, 800);
            stars.forEach(star => {
                const rect = star.getBoundingClientRect();
                const cx = rect.left + rect.width/2;
                const cy = rect.top  + rect.height/2;
                star._snapX    = cx;
                star._snapY    = cy;
                star._snapDist = Math.sqrt(Math.pow(cx-centerX,2)+Math.pow(cy-centerY,2));
            });
            waveActive    = true;
            waveStartTime = Date.now();
        }
        if (scroll < ARRIVAL_RESET_AT && arrived) {
            arrived    = false;
            waveActive = false;
            starContainer.classList.add('stars-fading');
            setTimeout(() => {
                stars.forEach(star => {
                    if (star._orbiting) {
                        star._orbiting = false;
                        delete star._snapDist;
                        star.style.animation = '';
                        star.style.left      = star.dataset.origLeft;
                        star.style.top       = '';
                    }
                });
                orbitingCount = 0;
                starContainer.classList.remove('stars-fading');
            }, 120);
        }

        needsRecalc = false;
    }

    function onScroll() {
        if (!needsRecalc) { needsRecalc = true; requestAnimationFrame(calcularObjetivo); }
    }

    function lerp(a, b, n) { return a + (b - a) * n; }

    /* ---------------------------------------------------------
       LOOP DE ANIMACIÓN
    --------------------------------------------------------- */
    function animar() {
        // ── Lerp de todos los valores ──
        state.starDx        = lerp(state.starDx,        target.starDx,        LERP_FACTOR);
        state.starDy        = lerp(state.starDy,        target.starDy,        LERP_FACTOR);
        state.sparkScale    = lerp(state.sparkScale,    target.sparkScale,    LERP_FACTOR);
        state.sparkRot      = lerp(state.sparkRot,      target.sparkRot,      LERP_FACTOR);
        state.sparkOpacity  = lerp(state.sparkOpacity,  target.sparkOpacity,  LERP_FACTOR);
        state.trailProgress = lerp(state.trailProgress, target.trailProgress, LERP_FACTOR);
        state.logoClipY     = lerp(state.logoClipY,     target.logoClipY,     LERP_FACTOR);
        state.sOpacity      = lerp(state.sOpacity,      target.sOpacity,      LERP_FACTOR);
        state.logoOpacity   = lerp(state.logoOpacity,   target.logoOpacity,   LERP_FACTOR);
        state.bgGlow        = lerp(state.bgGlow,        target.bgGlow,        LERP_FACTOR);
        state.cornerProgress  = lerp(state.cornerProgress,  target.cornerProgress,  LERP_FACTOR);
        state.starSectionX    = lerp(state.starSectionX,    target.starSectionX,    LERP_FACTOR);
        state.starSectionY    = lerp(state.starSectionY,    target.starSectionY,    LERP_FACTOR);
        state.starSectionRot  = lerp(state.starSectionRot,  target.starSectionRot,  LERP_FACTOR);
        state.sec1Opacity     = lerp(state.sec1Opacity,     target.sec1Opacity,     LERP_FACTOR);
        state.sec2Opacity     = lerp(state.sec2Opacity,     target.sec2Opacity,     LERP_FACTOR);
        state.sec3Opacity     = lerp(state.sec3Opacity,     target.sec3Opacity,     LERP_FACTOR);
        state.finalLogoOpacity = lerp(state.finalLogoOpacity, target.finalLogoOpacity, LERP_FACTOR);

        // ── Inyección CSS vars del hero ──
        root.style.setProperty('--star-dx',        state.starDx);
        root.style.setProperty('--star-dy',        state.starDy);
        root.style.setProperty('--spark-scale',    state.sparkScale);
        root.style.setProperty('--spark-rot',      `${state.sparkRot}deg`);
        root.style.setProperty('--spark-opacity',  state.sparkOpacity);
        root.style.setProperty('--trail-progress', state.trailProgress);
        root.style.setProperty('--logo-clip-y',    state.logoClipY);
        root.style.setProperty('--s-opacity',      state.sOpacity);
        root.style.setProperty('--logo-opacity',   state.logoOpacity);
        root.style.setProperty('--bg-glow',        state.bgGlow);

        // ── Inyección CSS vars de secciones ──
        root.style.setProperty('--sec1-opacity',         state.sec1Opacity);
        root.style.setProperty('--sec2-opacity',         state.sec2Opacity);
        root.style.setProperty('--sec3-opacity',         state.sec3Opacity);
        root.style.setProperty('--final-logo-opacity',   state.finalLogoOpacity);

        // ── Posicionamiento del logo container ──
        // cp controla el logo (revierte en la sección final).
        // frozenStarCp se congela en 1 cuando las secciones empiezan, para que
        // la estrella NO se encoja cuando el logo vuelve al centro.
        const cp = state.cornerProgress;
        const fp = state.finalLogoOpacity;

        if (sectionActive) {
            if (fp > 0) {
                // Sección final: la estrella regresa a la posición original del logo.
                // frozenStarCp baja de 1 a 0 al mismo ritmo que fp sube de 0 a 1,
                // causando el encogimiento y desplazamiento de vuelta al ícono S.
                frozenStarCp = 1 - fp;
            } else {
                // Secciones normales: se bloquea en 1 para mantener la estrella grande.
                frozenStarCp = Math.max(frozenStarCp, cp);
            }
        } else {
            frozenStarCp = 0;
        }

        const logoW = initialLogoW * (1-cp) + 46 * cp;
        const logoH = logoW * 426 / 325;
        const logoTopPx  = viewCenterY * (1-cp) + 24 * cp;
        const logoLeftPx = viewCenterX * (1-cp) + 24 * cp;
        const offX = -(initialLogoW / 2) * (1-cp);
        const offY = -(initialLogoH / 2) * (1-cp);

        // En la sección final: escala el logo a 70% y lo desplaza hacia arriba
        // para que el bloque (logo + texto) quede centrado verticalmente.
        // El desplazamiento sube 38px × fp, que es ≈ mitad de la altura del texto.
        const finalScale = 1 - fp * 0.30;
        const vertShift  = fp * 38;
        const logoTransform = `translate(${offX}px, ${offY - vertShift}px) scale(${finalScale})`;

        root.style.setProperty('--logo-top',       `${logoTopPx}px`);
        root.style.setProperty('--logo-left',      `${logoLeftPx}px`);
        root.style.setProperty('--logo-transform', logoTransform);
        root.style.setProperty('--logo-width',     `${logoW}px`);

        // Bloque de texto: justo debajo del logo visual (usa tamaño y posición reales)
        // Centro visual del logo = (logoLeftPx + offX + logoW/2, logoTopPx + offY - vertShift + logoH/2)
        const logoCenterX = logoLeftPx + offX + logoW / 2;
        const logoCenterY = logoTopPx  + offY - vertShift + logoH / 2;
        const visLogoH    = logoH * finalScale;
        root.style.setProperty('--final-text-top',    `${logoCenterY + visLogoH/2 + 10}px`);
        root.style.setProperty('--final-text-left',   `${logoCenterX}px`);
        root.style.setProperty('--final-text-width',  `${logoW * finalScale}px`);
        root.style.setProperty('--final-text-opacity', fp);

        // ── Estrella decorativa de sección ──
        // Usa frozenStarCp (congelado en 1) para que la estrella permanezca
        // en su posición de sección aunque el logo revierta al centro.
        if (sectionStar) {
            const scp = frozenStarCp;

            // Destino real de la estrella: posición del ícono S en el logo actual,
            // teniendo en cuenta la escala (finalScale) y el desplazamiento (vertShift).
            // logoCenterX/Y son el centro visual del logo, calculados arriba.
            const starDX = (226 / initialLogoW - 0.5) * logoW; // desplazamiento desde el centro del logo
            const starDY = (17  / initialLogoH - 0.5) * logoH;
            const destX  = logoCenterX + starDX * finalScale;   // posición real en pantalla
            const destY  = logoCenterY + starDY * finalScale;
            const destSz = logoStarSz0 * finalScale;

            const sW  = destSz + (finalStarW         - destSz) * scp;
            const sCX = destX  + (state.starSectionX - destX)  * scp;
            const sCY = destY  + (state.starSectionY - destY)  * scp;

            sectionStar.style.width     = sW + 'px';
            sectionStar.style.height    = sW + 'px';
            sectionStar.style.left      = (sCX - sW/2) + 'px';
            sectionStar.style.top       = (sCY - sW/2) + 'px';
            sectionStar.style.right     = 'auto';
            sectionStar.style.transform = `rotate(${scp*18 + state.starSectionRot}deg)`;
            // Se desvanece en el último 20% del recorrido de vuelta (scp 0.2→0)
            // para que el swap con la estrella del logo sea limpio y sin duplicado.
            sectionStar.style.opacity   = sectionActive ? Math.min(scp * 5, 1) : 0;

            if (sectionStarPath) {
                const colorP = Math.max((scp - 0.70) / 0.30, 0);
                const r = Math.round(254 + (3   - 254) * colorP);
                const g = Math.round(163 + (13  - 163) * colorP);
                const b = Math.round(20  + (30  - 20)  * colorP);
                sectionStarPath.style.fill          = `rgb(${r},${g},${b})`;
                sectionStarPath.style.strokeOpacity = colorP;
            }
        }

        // ── Shockwave de estrellas ──
        if (waveActive || orbitingCount > 0) {
            const now        = Date.now();
            const waveRadius = waveActive ? (now - waveStartTime)/1000*WAVE_SPEED : Infinity;
            if (waveActive && waveRadius > maxWaveR) waveActive = false;

            stars.forEach(star => {
                if (!star._orbiting && waveActive && star._snapDist != null && star._snapDist < waveRadius) {
                    const dx = star._snapX - centerX;
                    const dy = star._snapY - centerY;
                    star._orbiting   = true;
                    star._orbitR     = parseFloat(star.dataset.orbitR);
                    star._orbitAngle = Math.atan2(dy, dx);
                    star._orbitSpeed = (2*Math.PI) / parseFloat(star.dataset.orbitDuration);
                    star._orbitStart = now;
                    orbitingCount++;

                    const blinkDur = star.style.getPropertyValue('--blink-duration') || '1s';
                    const blinkDel = star.style.getPropertyValue('--blink-delay')    || '0s';
                    const half = parseFloat(star.style.width) / 2;
                    star.style.animation = `blinkStar ${blinkDur} ${blinkDel} ease-in-out infinite alternate`;
                    star.style.left = (centerX + Math.cos(star._orbitAngle)*star._orbitR - half) + 'px';
                    star.style.top  = (centerY + Math.sin(star._orbitAngle)*star._orbitR - half) + 'px';
                }
                if (star._orbiting) {
                    const elapsed = (Date.now() - star._orbitStart) / 1000;
                    const angle   = star._orbitAngle + star._orbitSpeed * elapsed;
                    const half    = parseFloat(star.style.width) / 2;
                    star.style.left = (centerX + Math.cos(angle)*star._orbitR - half) + 'px';
                    star.style.top  = (centerY + Math.sin(angle)*star._orbitR - half) + 'px';
                }
            });
        }

        requestAnimationFrame(animar);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    calcularObjetivo();
    requestAnimationFrame(animar);
}