/**
 * P6.3 UI-only smoothing for SVG gauge needles and level arcs.
 * This never modifies vehicle physics or exact digital readouts.
 *
 * Time-normalized first-order response avoids framerate-dependent tuning.
 * The target is snapped on a first frame or when reduced motion is requested.
 */
export class GaugeSmoother {
  private actual = 0;
  private desired = 0;
  private initialized = false;

  constructor(
    readonly tauMs: number = 135,
    readonly epsilon: number = 0.002
  ) {
    if (!Number.isFinite(tauMs) || tauMs <= 0 ||
        !Number.isFinite(epsilon) || epsilon <= 0)
      throw new RangeError("Invalid gauge smoothing parameters");
  }

  get value(): number { return this.actual; }
  get target(): number { return this.desired; }
  get settled(): boolean {
    return this.initialized && Math.abs(this.actual - this.desired) <= this.epsilon;
  }

  reset(): void {
    this.initialized = false;
    this.actual = this.desired = 0;
  }

  setTarget(next: number, snap = false): void {
    if (!Number.isFinite(next)) return;
    if (!this.initialized || snap) {
      this.actual = this.desired = next;
      this.initialized = true;
      return;
    }
    this.desired = next;
  }

  snap(): void {
    if (this.initialized) this.actual = this.desired;
  }

  /** Return true if the display still needs another paint. */
  step(deltaMs: number): boolean {
    if (!this.initialized || this.settled) return false;
    // Browser tab resume must not produce huge jumps or a numerical error.
    const dt = Number.isFinite(deltaMs)
      ? Math.max(0, Math.min(50, deltaMs)) : 0;
    const a = 1 - Math.exp(-dt / this.tauMs);
    this.actual += (this.desired - this.actual) * a;
    if (this.settled) this.actual = this.desired;
    return !this.settled;
  }
}
