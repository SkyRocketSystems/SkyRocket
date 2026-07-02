document.addEventListener('DOMContentLoaded', () => {
    crearEstrellas();
    iniciarMotorScroll();
});

/* =============================================================
   CAMPO DE ESTRELLAS DE FONDO
   Genera divs con tamaño, posición y animación aleatorios.
   Los parámetros de animación se guardan como CSS custom
   properties para que el CSS los use en modo flotación.
   La órbita es completamente JS-driven. Cada estrella recibe
   un radio de órbita preestablecido (80-380px) al crearse,
   independiente de su posición durante el float — esto evita
   que estrellas off-screen generen órbitas de radios enormes
   que harían que el centro de rotación parezca incorrecto.
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
        const viewDiagonal  = Math.sqrt(
            Math.pow(window.innerWidth  / 2, 2) +
            Math.pow(window.innerHeight / 2, 2)
        );
        const orbitR        = Math.random() * (viewDiagonal - 80) + 80; // 80px hasta la esquina, preestablecido
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
   Curvas de aceleración usadas en las distintas fases del scroll.
============================================================= */
const easeInCubic    = t => t * t * t;
const easeOutCubic   = t => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* =============================================================
   TRAYECTORIA DE LA ESTRELLA
   Puntos medidos sobre la geometría real del trazo (eje central
   entre los brazos de la llama). Arranca fuera de pantalla y
   termina en el punto de reposo exacto del ícono (226,17).
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

// Interpolación Catmull-Rom entre 4 puntos de control.
function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
    const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
    return { x, y };
}

// t global en [0,1] -> punto sobre toda la trayectoria (STAR_PATH).
function puntoEnTrayectoria(t) {
    const pts  = STAR_PATH;
    const nSeg = pts.length - 1;
    let segF   = t * nSeg;
    let seg    = Math.floor(segF);
    if (seg >= nSeg) seg = nSeg - 1;
    const localT = segF - seg;
    const p0 = pts[Math.max(seg - 1, 0)];
    const p1 = pts[seg];
    const p2 = pts[seg + 1];
    const p3 = pts[Math.min(seg + 2, nSeg)];
    return catmullRom(p0, p1, p2, p3, localT);
}

/* =============================================================
   MOTOR DE SCROLL
   Tres fases de scroll para el logo + shockwave radial para
   las estrellas. La onda sale del centro al dispararse el flash
   y activa la órbita de cada estrella individualmente cuando
   la alcanza, dando el efecto de expansión progresiva.
============================================================= */
function iniciarMotorScroll() {
    const root          = document.documentElement;
    const ignitionFx    = document.getElementById('ignition-fx');
    const spark         = document.querySelector('.layer-estrella');
    const starContainer = document.getElementById('star-container');
    const stars         = Array.from(document.querySelectorAll('.star'));

    const LERP_FACTOR      = 0.09;
    const ARRIVAL_AT       = 0.30;
    const ARRIVAL_RESET_AT = 0.28;
    const WAVE_SPEED       = 1200; // px/s — velocidad de expansión del shockwave

    /* Centro del viewport = posición del logo en pantalla.
       Se calcula una vez al cargar; si el usuario redimensiona
       la ventana el cambio es mínimo para esta animación. */
    const centerX  = window.innerWidth  / 2;
    const centerY  = window.innerHeight / 2;
    const maxWaveR = Math.sqrt(
        Math.pow(window.innerWidth,  2) +
        Math.pow(window.innerHeight, 2)
    ); // diagonal máxima del viewport

    const REST  = STAR_PATH[STAR_PATH.length - 1];
    const START = STAR_PATH[0];

    const state = {
        starDx: START.x - REST.x, starDy: START.y - REST.y,
        sparkScale: 0.7, sparkRot: 0, sparkOpacity: 0,
        trailProgress: 0,
        logoClipY: START.y,
        sOpacity: 1, logoOpacity: 0, bgGlow: 0
    };
    const target = { ...state };

    let needsRecalc  = false;
    let arrived      = false;
    let waveActive   = false;
    let waveStartTime = 0;
    let orbitingCount = 0; // evita iterar stars[] cuando no hay ninguna en órbita

    function calcularObjetivo() {
        const maxScroll = document.body.scrollHeight - window.innerHeight;
        let scroll = maxScroll > 0 ? window.scrollY / maxScroll : 0;
        if (scroll < 0) scroll = 0;
        if (scroll > 1) scroll = 1;

        // FASE 1 (0%-30%): estrella viaja, dibuja el trazo, revela el logo.
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
        // FASE 2 (30%-50%): estrella en su lugar, se asienta el brillo.
        else if (scroll < 0.50) {
            const p             = easeInOutCubic((scroll - 0.30) / 0.20);
            target.starDx       = 0;
            target.starDy       = 0;
            target.sparkOpacity = 1;
            target.sparkScale   = 1 + (1 - p) * 0.2;
            target.sparkRot     = 360;
            target.trailProgress = 1;
            target.logoClipY    = REST.y;
            target.logoOpacity  = 1;
            target.sOpacity     = 0;
            target.bgGlow       = 0.3 + p * 0.7;
        }
        // FASE 3 (50%-100%): estado final.
        else {
            target.starDx = 0; target.starDy = 0;
            target.sparkOpacity = 1; target.sparkScale = 1; target.sparkRot = 360;
            target.trailProgress = 1; target.logoClipY = REST.y;
            target.logoOpacity = 1; target.sOpacity = 0; target.bgGlow = 1;
        }

        /* Disparo único: flash + shockwave al llegar la estrella.
           Se toma un snapshot de la posición actual de cada estrella
           para calcular su distancia al centro y ordenar el shockwave. */
        if (scroll >= ARRIVAL_AT && !arrived) {
            arrived = true;
            ignitionFx.classList.add('fire');
            if (spark) spark.classList.add('kick');
            setTimeout(() => {
                ignitionFx.classList.remove('fire');
                if (spark) spark.classList.remove('kick');
            }, 800);

            stars.forEach(star => {
                const rect      = star.getBoundingClientRect();
                const cx        = rect.left + rect.width  / 2;
                const cy        = rect.top  + rect.height / 2;
                star._snapX     = cx;
                star._snapY     = cy;
                star._snapDist  = Math.sqrt(
                    Math.pow(cx - centerX, 2) +
                    Math.pow(cy - centerY, 2)
                );
            });
            waveActive    = true;
            waveStartTime = Date.now();
        }

        /* Reverse: el usuario sube el scroll. Se para la onda y todas
           las estrellas en órbita vuelven a la animación CSS de flotación
           con un breve fade para suavizar el salto de posición. */
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
        if (!needsRecalc) {
            needsRecalc = true;
            requestAnimationFrame(calcularObjetivo);
        }
    }

    function lerp(a, b, n) { return a + (b - a) * n; }

    /* Loop continuo: suaviza el estado del logo e inyecta CSS vars.
       También gestiona la expansión del shockwave y actualiza la
       posición de cada estrella en órbita frame a frame. */
    function animar() {
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

        /* Shockwave: expande el radio de la onda y activa la órbita
           de cada estrella individualmente cuando la onda la alcanza.
           La órbita usa la posición real de la estrella en ese momento
           como punto de entrada, evitando saltos de posición. */
        if (waveActive || orbitingCount > 0) {
            const now        = Date.now();
            const waveRadius = waveActive
                ? (now - waveStartTime) / 1000 * WAVE_SPEED
                : Infinity;

            if (waveActive && waveRadius > maxWaveR) waveActive = false;

            stars.forEach(star => {
                // Activar órbita cuando la onda alcanza a esta estrella.
                // Radio: preestablecido (siempre dentro del viewport).
                // Ángulo: el que tiene respecto al centro en el snapshot
                // (evita salto angular; solo hay un ajuste radial pequeño).
                if (!star._orbiting && waveActive && star._snapDist != null && star._snapDist < waveRadius) {
                    const dx = star._snapX - centerX;
                    const dy = star._snapY - centerY;
                    star._orbiting   = true;
                    star._orbitR     = parseFloat(star.dataset.orbitR);
                    star._orbitAngle = Math.atan2(dy, dx);
                    star._orbitSpeed = (2 * Math.PI) / parseFloat(star.dataset.orbitDuration);
                    star._orbitStart = now;
                    orbitingCount++;

                    const blinkDur = star.style.getPropertyValue('--blink-duration') || '1s';
                    const blinkDel = star.style.getPropertyValue('--blink-delay')    || '0s';
                    const half = parseFloat(star.style.width) / 2;
                    star.style.animation = `blinkStar ${blinkDur} ${blinkDel} ease-in-out infinite alternate`;
                    star.style.left = (centerX + Math.cos(star._orbitAngle) * star._orbitR - half) + 'px';
                    star.style.top  = (centerY + Math.sin(star._orbitAngle) * star._orbitR - half) + 'px';
                }

                // Actualizar posición de la estrella en órbita cada frame
                if (star._orbiting) {
                    const elapsed = (Date.now() - star._orbitStart) / 1000;
                    const angle   = star._orbitAngle + star._orbitSpeed * elapsed;
                    const half    = parseFloat(star.style.width) / 2;
                    star.style.left = (centerX + Math.cos(angle) * star._orbitR - half) + 'px';
                    star.style.top  = (centerY + Math.sin(angle) * star._orbitR - half) + 'px';
                }
            });
        }

        requestAnimationFrame(animar);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    calcularObjetivo();
    requestAnimationFrame(animar);
}