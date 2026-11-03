/**
 * EngineSoundLab original procedural audio DSP, P1 slice.
 * Independent of DOM/AudioWorklet; safe to render offline in Node.
 * No recordings and no dependency on the visible RPM gauge.
 *
 * NOTE: These are musically/physically motivated acoustic approximations,
 * not measured engine pressure traces or a real vehicle calibration.
 */
const FIRING_ANGLES = [0, 180, 360, 540]; // 4-stroke inline-4, 720-degree cycle
const clamp = (value, min, max, fallback = min) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));

export class EngineSynthCore {
  constructor(rate = 48000, noiseSeed = 0x6d2b79f5) {
    if (!Number.isFinite(rate) || rate < 8000 || rate > 192000)
      throw new RangeError("unsupported sample rate");
    this.rate = rate;
    this.seed = (noiseSeed >>> 0) || 1;
    this.rpm = 850;
    this.load = 0;
    this.throttle = 0;
    this.speed = 0;
    this.active = 0;
    this.combustion = 1;
    this.crankAngle = 0;
    this.nextFiring = 0;
    this.firingEvents = 0;
    this.fastPulse = 0;
    this.slowPulse = 0;
    this.exhaustLow = 0;
    this.intakeLow = 0;
    this.roadLow = 0;
    this.hp = 0;
    this.prevMix = 0;
    this.resA = 0;
    this.resA2 = 0;
    this.resB = 0;
    this.resB2 = 0;
    this.rpmLag = Math.exp(-1 / (rate * 0.025));
    this.loadLag = Math.exp(-1 / (rate * 0.036));
    this.throttleLag = Math.exp(-1 / (rate * 0.022));
    this.speedLag = Math.exp(-1 / (rate * 0.075));
    this.gateLag = Math.exp(-1 / (rate * 0.012));
    this.fastDecay = Math.exp(-1 / (rate * 0.00065));
    this.slowDecay = Math.exp(-1 / (rate * 0.0048));
    // Stable, fixed acoustic resonators; their frequencies do NOT follow RPM.
    const aRadius = 0.990;
    const bRadius = 0.985;
    this.resACoeff = 2 * aRadius * Math.cos(2 * Math.PI * 118 / rate);
    this.resBCoeff = 2 * bRadius * Math.cos(2 * Math.PI * 247 / rate);
    this.resASquared = aRadius * aRadius;
    this.resBSquared = bRadius * bRadius;
    this.resAGain = 1 - aRadius;
    this.resBGain = 1 - bRadius;
  }

  random() {
    let x = this.seed;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 2147483648 - 1;
  }

  /**
   * Audio sample, with no transient allocations.
   * @param {number} targetRpm
   * @param {number} targetLoad 0..1, derived from vehicle engine load
   * @param {number} targetThrottle 0..1, independent of engine load
   * @param {number} targetSpeed vehicle speed in m/s
   * @param {number} targetActive app/audio gate, 0..1
   * @param {number} targetCombustion 0..1, distinct from motor/road sounds
   */
  next(targetRpm, targetLoad, targetThrottle, targetSpeed, targetActive = 1, targetCombustion = 1) {
    const rpm = clamp(targetRpm, 0, 8000, 850);
    const load = clamp(targetLoad, 0, 1);
    const throttle = clamp(targetThrottle, 0, 1);
    const speed = clamp(targetSpeed, 0, 90);
    const active = clamp(targetActive, 0, 1);
    const combustion = clamp(targetCombustion, 0, 1);
    this.rpm = this.rpm * this.rpmLag + rpm * (1 - this.rpmLag);
    this.load = this.load * this.loadLag + load * (1 - this.loadLag);
    this.throttle = this.throttle * this.throttleLag + throttle * (1 - this.throttleLag);
    this.speed = this.speed * this.speedLag + speed * (1 - this.speedLag);
    this.active = this.active * this.gateLag + active * (1 - this.gateLag);
    this.combustion = this.combustion * this.gateLag + combustion * (1 - this.gateLag);

    // Four cylinders, one ignition per 180 degrees, two per revolution.
    // At 8,000 rpm / 8,000 Hz (min supported rate), < 6 crank deg per sample.
    const degreesPerSample = this.rpm * 6 / this.rate;
    this.crankAngle += degreesPerSample;
    if (this.crankAngle >= 720) {
      this.crankAngle -= 720;
      this.nextFiring = 0;
    }
    if (this.nextFiring < FIRING_ANGLES.length &&
        this.crankAngle >= FIRING_ANGLES[this.nextFiring]) {
      // Slight per-cylinder amplitude differences keep the sequence alive.
      const amplitudes = [1.0, 0.965, 1.03, 0.985];
      const strength = (0.42 + 0.38 * this.load + 0.20 * this.throttle) *
        amplitudes[this.nextFiring] * this.combustion;
      this.fastPulse += strength;
      this.slowPulse += strength;
      this.firingEvents++;
      this.nextFiring++;
    }

    this.fastPulse *= this.fastDecay;
    this.slowPulse *= this.slowDecay;
    const pressure = this.slowPulse - this.fastPulse; // smooth, positive exhaust pulse
    // Two narrow acoustic bands from fixed-length pipes, plus broadband body.
    const a = this.resACoeff * this.resA - this.resASquared * this.resA2 + this.resAGain * pressure;
    const b = this.resBCoeff * this.resB - this.resBSquared * this.resB2 + this.resBGain * pressure;
    this.resA2 = this.resA; this.resA = a;
    this.resB2 = this.resB; this.resB = b;

    // Exhaust body + high-frequency pressure edge (load-sensitive rasp).
    this.exhaustLow += 0.14 * (pressure - this.exhaustLow);
    const rasp = pressure - this.exhaustLow;
    const exhaust = 0.76 * this.exhaustLow + 0.15 * a + 0.12 * b +
      (0.07 + 0.17 * this.load) * rasp;

    // Air induction + turbulence, independent of exhaust firing geometry.
    const white = this.random();
    const airCutoff = 270 + 2100 * this.throttle + 0.12 * this.rpm;
    const intakeCoefficient = Math.min(0.65, 2 * Math.PI * airCutoff / this.rate);
    this.intakeLow += intakeCoefficient * (white - this.intakeLow);
    const intake = this.intakeLow * (0.018 + 0.12 * this.throttle + 0.08 * this.load);

    // Low-strength crankshaft/mechanical order, derived from crank angle.
    const crankRadians = this.crankAngle * Math.PI / 180;
    const mechanical = Math.sin(crankRadians) * (0.013 + 0.025 * this.load);

    // Road noise is retained when combustion is disabled. Shared with future EV modes.
    const roadWhite = this.random();
    this.roadLow += 0.025 * (roadWhite - this.roadLow);
    const roadLevel = Math.pow(Math.min(1, this.speed / 40), 1.3);
    const rolling = this.roadLow * 0.13 * roadLevel;

    const mix = (exhaust + intake + mechanical) * this.combustion + rolling;
    // DC block + bounded saturation; no sample value leaves [-0.54, +0.54].
    this.hp = mix - this.prevMix + 0.995 * this.hp;
    this.prevMix = mix;
    return Math.tanh(this.hp * 1.7) * 0.54 * this.active;
  }
}
