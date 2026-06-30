document.addEventListener('DOMContentLoaded', () => {
    crearEstrellas();
    iniciarMotorScroll();
});

/* =============================================================
   CAMPO DE ESTRELLAS DE FONDO
   Genera 150 divs con tamaño, posición y animación aleatorios
   (desplazamiento vertical infinito + parpadeo).
============================================================= */
function crearEstrellas() {
    const contenedor = document.getElementById('star-container');
    const numStars = 150;

    for (let i = 0; i < numStars; i++) {
        let star = document.createElement('div');
        star.classList.add('star');

        let size = Math.random() * 1 + 5;
        let left = Math.random() * 100;
        let moveDuration = Math.random() * 30 + 20;
        let moveDelay = -(Math.random() * moveDuration);
        let blinkDuration = Math.random() * 1.5 + 0.5;
        let blinkDelay = Math.random() * 2;

        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.left = `${left}vw`;
        star.style.animationDuration = `${moveDuration}s, ${blinkDuration}s`;
        star.style.animationDelay = `${moveDelay}s, ${blinkDelay}s`;

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
   Puntos medidos sobre la geometría real del trazo (promedio de
   los cruces del contorno en cada altura = eje central entre los
   brazos de la llama). Arranca fuera de pantalla y termina en el
   punto de reposo exacto del ícono (226,17).
============================================================= */
const STAR_PATH = [
    { x: 150, y: 475 }, // arranque, fuera de pantalla
    { x: 150, y: 425 }, // centro real entre las dos puntas inferiores
    { x: 123, y: 380 },
    { x: 114, y: 320 },
    { x: 120, y: 260 },
    { x: 136, y: 200 },
    { x: 161, y: 140 },
    { x: 226, y: 17 },  // punto de reposo del ícono (= transform-origin)
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
    const pts = STAR_PATH;
    const nSeg = pts.length - 1;
    let segF = t * nSeg;
    let seg = Math.floor(segF);
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
   Calcula, en cada scroll, los valores "objetivo" de cada fase y
   los suaviza cuadro a cuadro (lerp) antes de inyectarlos como
   variables CSS. Tres fases: 1) la estrella viaja y dibuja el
   trazo + revela el logo, 2) llega arriba y dispara el flash,
   3) todo se asienta en su estado final.
============================================================= */
function iniciarMotorScroll() {
    const root = document.documentElement;
    const ignitionFx = document.getElementById('ignition-fx');
    const spark = document.querySelector('.layer-estrella');

    const LERP_FACTOR = 0.09; // suavizado por frame (más bajo = más cinemático)

    const ARRIVAL_AT = 0.30;       // scroll en el que la estrella llega arriba
    const ARRIVAL_RESET_AT = 0.28; // margen para evitar doble disparo en el límite

    const REST = STAR_PATH[STAR_PATH.length - 1];  // punto de reposo final (226,17)
    const START = STAR_PATH[0];                    // punto de arranque (abajo, fuera de pantalla)

    // Estado realmente renderizado (se mueve suave) vs. objetivo (cambia de golpe con el scroll).
    const state = {
        starDx: START.x - REST.x, starDy: START.y - REST.y,
        sparkScale: 0.7, sparkRot: 0, sparkOpacity: 0,
        trailProgress: 0,
        logoClipY: START.y,
        sOpacity: 1, logoOpacity: 0, bgGlow: 0
    };
    const target = { ...state };

    let needsRecalc = false;
    let arrived = false; // la llegada/ignición es un evento de un solo disparo

    function calcularObjetivo() {
        const maxScroll = document.body.scrollHeight - window.innerHeight;
        let scroll = maxScroll > 0 ? window.scrollY / maxScroll : 0;
        if (scroll < 0) scroll = 0;
        if (scroll > 1) scroll = 1;

        // FASE 1 (0%-30%): la estrella viaja desde abajo, dibuja el trazo
        // y revela el logo a color con un barrido que sigue su altura real.
        if (scroll < 0.30) {
            const t = easeInOutCubic(scroll / 0.30);
            const p = puntoEnTrayectoria(t);
            target.starDx = p.x - REST.x;
            target.starDy = p.y - REST.y;

            target.sparkOpacity = Math.min(t / 0.12, 1); // aparece "de la nada"
            target.sparkScale = 0.7 + t * 0.3;
            target.sparkRot = t * 360;

            target.trailProgress = t;
            target.logoClipY = p.y;
            target.logoOpacity = 1;
            target.sOpacity = 1 - easeOutCubic(Math.min(t / 0.45, 1)); // se apaga rápido, primera mitad del viaje
            target.bgGlow = t * 0.3;
        }
        // FASE 2 (30%-50%): ya en su lugar; flash de llegada y se asienta el brillo.
        else if (scroll < 0.50) {
            const p = easeInOutCubic((scroll - 0.30) / 0.20);
            target.starDx = 0;
            target.starDy = 0;
            target.sparkOpacity = 1;
            target.sparkScale = 1 + (1 - p) * 0.2; // pequeño impacto al llegar
            target.sparkRot = 360;

            target.trailProgress = 1;
            target.logoClipY = REST.y;
            target.logoOpacity = 1;
            target.sOpacity = 0;
            target.bgGlow = 0.3 + p * 0.7;
        }
        // FASE 3 (50%-100%): estado final, todo asentado.
        else {
            target.starDx = 0;
            target.starDy = 0;
            target.sparkOpacity = 1;
            target.sparkScale = 1;
            target.sparkRot = 360;

            target.trailProgress = 1;
            target.logoClipY = REST.y;
            target.logoOpacity = 1;
            target.sOpacity = 0;
            target.bgGlow = 1;
        }

        // Disparo único del flash + impacto al cruzar el umbral de llegada.
        if (ignitionFx) {
            if (scroll >= ARRIVAL_AT && !arrived) {
                arrived = true;
                ignitionFx.classList.add('fire');
                if (spark) spark.classList.add('kick');
                setTimeout(() => {
                    ignitionFx.classList.remove('fire');
                    if (spark) spark.classList.remove('kick');
                }, 800);
            } else if (scroll < ARRIVAL_RESET_AT && arrived) {
                arrived = false; // permite volver a dispararse si sube y baja
            }
        }

        needsRecalc = false;
    }

    function onScroll() {
        if (!needsRecalc) {
            needsRecalc = true;
            requestAnimationFrame(calcularObjetivo);
        }
    }

    function lerp(a, b, n) {
        return a + (b - a) * n;
    }

    // Loop continuo: suaviza el estado actual hacia el objetivo e
    // inyecta el resultado como variables CSS en :root.
    function animar() {
        state.starDx = lerp(state.starDx, target.starDx, LERP_FACTOR);
        state.starDy = lerp(state.starDy, target.starDy, LERP_FACTOR);
        state.sparkScale = lerp(state.sparkScale, target.sparkScale, LERP_FACTOR);
        state.sparkRot = lerp(state.sparkRot, target.sparkRot, LERP_FACTOR);
        state.sparkOpacity = lerp(state.sparkOpacity, target.sparkOpacity, LERP_FACTOR);
        state.trailProgress = lerp(state.trailProgress, target.trailProgress, LERP_FACTOR);
        state.logoClipY = lerp(state.logoClipY, target.logoClipY, LERP_FACTOR);
        state.sOpacity = lerp(state.sOpacity, target.sOpacity, LERP_FACTOR);
        state.logoOpacity = lerp(state.logoOpacity, target.logoOpacity, LERP_FACTOR);
        state.bgGlow = lerp(state.bgGlow, target.bgGlow, LERP_FACTOR);

        root.style.setProperty('--star-dx', state.starDx);
        root.style.setProperty('--star-dy', state.starDy);
        root.style.setProperty('--spark-scale', state.sparkScale);
        root.style.setProperty('--spark-rot', `${state.sparkRot}deg`);
        root.style.setProperty('--spark-opacity', state.sparkOpacity);
        root.style.setProperty('--trail-progress', state.trailProgress);
        root.style.setProperty('--logo-clip-y', state.logoClipY);
        root.style.setProperty('--s-opacity', state.sOpacity);
        root.style.setProperty('--logo-opacity', state.logoOpacity);
        root.style.setProperty('--bg-glow', state.bgGlow);

        requestAnimationFrame(animar);
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    calcularObjetivo();
    animar();
}