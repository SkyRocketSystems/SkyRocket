import type { LogoAnimator } from './logo-animator';

/**
 * ScrollEngine (simplified)
 * -------------------------
 * Listens for scroll and triggers the LogoAnimator once the user scrolls past
 * 10px. All the old section-star / corner-progress logic has been removed —
 * the page now uses simple empty snap-scroll sections.
 */
export class ScrollEngine {
  private readonly animator: LogoAnimator;
  private readonly TRIGGER_PX = 0;
  private triggered = false;

  constructor(animator: LogoAnimator) {
    this.animator = animator;
  }

  private onScroll = (): void => {
    if (!this.triggered && window.scrollY > this.TRIGGER_PX) {
      this.triggered = true;
      this.animator.trigger();
    }
  };

  start(): void {
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }

  dispose(): void {
    window.removeEventListener('scroll', this.onScroll);
  }
}