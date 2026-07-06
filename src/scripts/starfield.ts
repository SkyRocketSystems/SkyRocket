import * as THREE from 'three';

/**
 * StarField
 * --------
 * GPU star field that replaces the original 150 DOM <div> stars.
 *
 * A single THREE.Points object renders every star with a custom shader that
 * computes, per-vertex and entirely on the GPU:
 *   - the continuous downward "fall" animation (formerly a CSS keyframe),
 *   - the blinking opacity (formerly a CSS keyframe),
 *   - the orbit snap when the ignition shockwave reaches each star.
 *
 * The public surface is intentionally tiny:
 *   - triggerShockwave()  → called by the scroll engine at the arrival point.
 *   - resetShockwave()    → called by the scroll engine on scroll-back.
 *   - resize() / dispose()
 */
export class StarField {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  private readonly clock = new THREE.Clock();
  private rafId = 0;

  private readonly starCount: number;
  private readonly waveSpeed = 1200; // px / second (matches original WAVE_SPEED)

  private center = new THREE.Vector2(0, 0);
  private maxWaveR = 0;

  private shockActive = false;
  private shockStart = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.starCount = window.innerWidth >= 768 ? 250 : 150;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = this.buildCamera();

    this.geometry = new THREE.BufferGeometry();
    this.material = this.buildMaterial();
    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);

    this.buildAttributes();
    this.resize();
    this.loop();
  }

  /* ------------------------------------------------------------------ */
  /* Construction helpers                                               */
  /* ------------------------------------------------------------------ */

  private buildCamera(): THREE.OrthographicCamera {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Origin at the top-left corner, Y grows downwards → matches CSS px space.
    const cam = new THREE.OrthographicCamera(0, w, 0, h, -1, 1);
    cam.position.z = 1;
    return cam;
  }

  private buildMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uShockActive: { value: 0 },
        uShockRadius: { value: 0 },
        uCenter: { value: new THREE.Vector2() },
        uRangeY: { value: 0 },
        uBottomPad: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aPhase;
        attribute float aFallSpeed;
        attribute float aBlinkPhase;
        attribute float aBlinkSpeed;
        attribute float aOrbitRadius;
        attribute float aOrbitAngle;
        attribute float aOrbitSpeed;

        uniform float uTime;
        uniform float uShockActive;
        uniform float uShockRadius;
        uniform vec2  uCenter;
        uniform float uRangeY;
        uniform float uBottomPad;
        uniform float uPixelRatio;

        varying float vBlink;

        void main() {
          float bx = position.x;
          float by = position.y;

          // Continuous fall: wraps from 1.1*H (below screen) to -0.1*H (above).
          float fy = mod(by - uTime * aFallSpeed + aPhase + uRangeY, uRangeY)
                   - uBottomPad;

          float x = bx;
          float y = fy;

          // Shockwave: when the expanding radius reaches a star, it snaps to orbit.
          float dist = distance(vec2(bx, by), uCenter);
          float orbitMask = step(dist, uShockRadius) * uShockActive;
          if (orbitMask > 0.5) {
            float ang = aOrbitAngle + aOrbitSpeed * uTime;
            x = uCenter.x + cos(ang) * aOrbitRadius;
            y = uCenter.y + sin(ang) * aOrbitRadius;
          }

          // Blink (0.1 ↔ 1.0, eased via sine).
          vBlink = 0.55 + 0.45 * sin(uTime * aBlinkSpeed + aBlinkPhase);
          vBlink = clamp(vBlink, 0.1, 1.0);

          vec4 mv = modelViewMatrix * vec4(x, y, 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying float vBlink;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.0, d);
          alpha = pow(alpha, 1.6);
          gl_FragColor = vec4(vec3(1.0), alpha * vBlink);
        }
      `,
    });
  }

  /** (Re)generate every per-star attribute. Called on init and on resize. */
  private buildAttributes(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const n = this.starCount;

    const positions = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const phases = new Float32Array(n);
    const fallSpeeds = new Float32Array(n);
    const blinkPhases = new Float32Array(n);
    const blinkSpeeds = new Float32Array(n);
    const orbitRadii = new Float32Array(n);
    const orbitAngles = new Float32Array(n);
    const orbitSpeeds = new Float32Array(n);

    const diagHalf = Math.sqrt((w / 2) ** 2 + (h / 2) ** 2);

    for (let i = 0; i < n; i++) {
      positions[i * 3 + 0] = Math.random() * w; // x
      positions[i * 3 + 1] = Math.random() * h; // y
      positions[i * 3 + 2] = 0;

      sizes[i] = Math.random() * 1 + 5; // 5–6 px (matches original)

      const moveDuration = Math.random() * 30 + 20; // 20–50 s
      fallSpeeds[i] = (1.2 * h) / moveDuration;
      phases[i] = Math.random() * 1.2 * h;

      const blinkDuration = Math.random() * 1.5 + 0.5; // 0.5–2 s
      blinkSpeeds[i] = (2 * Math.PI) / blinkDuration;
      blinkPhases[i] = Math.random() * Math.PI * 2;

      const orbitR = Math.random() * (diagHalf - 80) + 80;
      const orbitDuration = Math.random() * 17 + 8; // 8–25 s
      orbitRadii[i] = orbitR;
      orbitSpeeds[i] = (2 * Math.PI) / orbitDuration;
      orbitAngles[i] = Math.random() * Math.PI * 2;
    }

    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    );
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.geometry.setAttribute(
      'aFallSpeed',
      new THREE.BufferAttribute(fallSpeeds, 1),
    );
    this.geometry.setAttribute(
      'aBlinkPhase',
      new THREE.BufferAttribute(blinkPhases, 1),
    );
    this.geometry.setAttribute(
      'aBlinkSpeed',
      new THREE.BufferAttribute(blinkSpeeds, 1),
    );
    this.geometry.setAttribute(
      'aOrbitRadius',
      new THREE.BufferAttribute(orbitRadii, 1),
    );
    this.geometry.setAttribute(
      'aOrbitAngle',
      new THREE.BufferAttribute(orbitAngles, 1),
    );
    this.geometry.setAttribute(
      'aOrbitSpeed',
      new THREE.BufferAttribute(orbitSpeeds, 1),
    );

    this.geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(w / 2, h / 2, 0),
      diagHalf + 200,
    );
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                         */
  /* ------------------------------------------------------------------ */

  /** Begin the ignition shockwave from the centre of the screen. */
  triggerShockwave(): void {
    if (this.shockActive) return;
    this.shockActive = true;
    this.shockStart = this.clock.getElapsedTime();
    this.material.uniforms.uShockActive.value = 1;
  }

  /** Cancel the shockwave and return stars to their falling state. */
  resetShockwave(): void {
    if (!this.shockActive) return;
    this.shockActive = false;
    this.material.uniforms.uShockActive.value = 0;
    this.material.uniforms.uShockRadius.value = 0;

    // Mirror the original 120 ms opacity fade so the snap back is masked.
    this.canvas.style.transition = 'opacity 0.12s ease';
    this.canvas.style.opacity = '0';
    window.setTimeout(() => {
      this.canvas.style.opacity = '1';
    }, 120);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);

    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = 0;
    this.camera.bottom = h;
    this.camera.updateProjectionMatrix();

    this.center.set(w / 2, h / 2);
    this.maxWaveR = Math.sqrt(w * w + h * h);

    this.material.uniforms.uCenter.value.copy(this.center);
    this.material.uniforms.uRangeY.value = 1.2 * h;
    this.material.uniforms.uBottomPad.value = 0.1 * h;
    this.material.uniforms.uPixelRatio.value = dpr;

    // Re-scatter stars so they fill the new viewport correctly.
    this.buildAttributes();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }

  /* ------------------------------------------------------------------ */
  /* Render loop                                                        */
  /* ------------------------------------------------------------------ */

  private loop = (): void => {
    const t = this.clock.getElapsedTime();
    this.material.uniforms.uTime.value = t;

    if (this.shockActive) {
      const radius = (t - this.shockStart) * this.waveSpeed;
      this.material.uniforms.uShockRadius.value = radius;
      // Once the wave has covered the whole screen, leave stars orbiting.
      if (radius > this.maxWaveR) {
        // keep uShockActive = 1 so stars continue orbiting indefinitely.
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.loop);
  };
}