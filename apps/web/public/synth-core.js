import { ElectricDriveSynth } from "./electric-synth.js";
import { VehicleIceAcoustics } from "./ice-acoustics.js";
import { CabinSoundstage } from "./cabin-soundstage.js";

/**
 * EngineSoundLab original procedural audio DSP, P1 slice.
 * Independent of DOM/AudioWorklet; safe to render offline in Node.
 * No recordings and no dependency on the visible RPM gauge.
 *
 * NOTE: These are musically/physically motivated acoustic approximations,
 * not measured engine pressure traces or a real vehicle calibration.
 */
/** Synthetic sound configurations, not calibrated OEM engine identities. */
export const ENGINE_PROFILES = Object.freeze({
  i3: { cylinders: 3, firingAngles: [0, 240, 480],
        amplitudes: [1.0, 0.93, 1.06], pulseGain: 1.12, mechanicalOrder: 1.5 },
  i4: { cylinders: 4, firingAngles: [0, 180, 360, 540],
        amplitudes: [1.0, 0.965, 1.03, 0.985], pulseGain: 1.0, mechanicalOrder: 1.0 },
  i6: { cylinders: 6, firingAngles: [0, 120, 240, 360, 480, 600],
        amplitudes: [1.0, 0.97, 1.025, 0.99, 1.015, 0.96],
        pulseGain: 0.78, mechanicalOrder: 3.0 }
});
const clamp = (value, min, max, fallback = min) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));

export class EngineSynthCore {
  constructor(rate = 48000, noiseSeed = 0x6d2b79f5, profileId = "i4") {
    if (!Number.isFinite(rate) || rate < 8000 || rate > 192000)
      throw new RangeError("unsupported sample rate");
    this.rate = rate;
    this.seed = (noiseSeed >>> 0) || 1;
    this.rpm = 850;
    this.load = 0;
    this.throttle = 0;
    this.speed = 0;
    this.active = 0;
    this.combustion = 0; // Default silence until engine combustion is explicitly enabled.
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
    this.electric = new ElectricDriveSynth(rate);
    this.iceAcoustics = new VehicleIceAcoustics(rate);
    this.soundstage = new CabinSoundstage(rate, this.seed ^ 0x35a9cf13);
    this.setProfile(profileId);
  }

  /** Changes firing geometry without resetting crankshaft phase or stored audio. */
  setProfile(profileId) {
    const profile = Object.hasOwn(ENGINE_PROFILES, profileId) ? ENGINE_PROFILES[profileId] : null;
    if (!profile) throw new RangeError("Unsupported engine sound profile: " + profileId);
    this.profileId = profileId;
    this.profile = profile;
    // The next ignition must be in the future; don't double-fire on a switch.
    let index = 0;
    while (index < profile.firingAngles.length &&
           profile.firingAngles[index] < this.crankAngle - 1e-7) index++;
    this.nextFiring = index;
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
  next(targetRpm, targetLoad, targetThrottle, targetSpeed, targetActive = 1,
       targetCombustion = 1, targetMotor = 0, targetMotorRpm = 0,
       targetRegen = 0, targetGenerator = 0, targetGeneratorRpm = 0,
       electricProfile = 0, iceProfile = 0, engineMotoring = 0,
       motorTorque = 0, generatorMotoring = 0,
       listeningMode = 0, roadRoughness = 0.35) {
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

    // Configurable four-stroke cycle, 720 crank degrees (I3/I4/I6).
    // Up to 8,000 RPM at 8 kHz is still under 6 degrees per sample.
    const degreesPerSample = this.rpm * 6 / this.rate;
    this.crankAngle += degreesPerSample;
    if (this.crankAngle >= 720) {
      this.crankAngle -= 720;
      this.nextFiring = 0;
    }
    if (this.nextFiring < this.profile.firingAngles.length &&
        this.crankAngle >= this.profile.firingAngles[this.nextFiring]) {
      // Slight per-cylinder amplitude differences keep the sequence alive.
      // Smooth the first firing when fuel is enabled, but stop creating
      // NEW ignition impulses the instant fuel is cut. Already excited
      // exhaust resonances decay naturally instead of being hard-muted.
      const strength = (0.42 + 0.38 * this.load + 0.20 * this.throttle) *
        this.profile.amplitudes[this.nextFiring] * this.profile.pulseGain *
        this.combustion * (combustion > 0 ? 1 : 0);
      this.fastPulse += strength;
      this.slowPulse += strength;
      if (combustion > 0 && this.combustion > 0.12) this.firingEvents++;
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
    const mechanical = Math.sin(crankRadians * this.profile.mechanicalOrder) * (0.013 + 0.025 * this.load);

    // Tyre and wind noise have their own bands in the P5-D soundstage.
    // No duplicate rolling-noise bed is mixed here.

    // Electric synthesis is independent of fuel combustion. Traction, generator
    // and regen voices use their own shaft rates and independent amplitudes.
    this.electric.next(targetMotor, targetMotorRpm,
      targetRegen, targetGenerator, targetGeneratorRpm, electricProfile,
      motorTorque, generatorMotoring);
    // P5-B: independent vehicle-specific ICE timbre and engine-motoring
    // voice. A rotating but unfuelled engine does not ignite fuel/exhaust.
    this.iceAcoustics.next(pressure, crankRadians, this.rpm, this.load,
      this.throttle, white, this.combustion, engineMotoring, iceProfile);
    const genericFuelledVoice = (exhaust + intake + mechanical) * this.combustion;
    const combustionVoice =
      genericFuelledVoice * this.iceAcoustics.genericBlend +
      this.iceAcoustics.combustionVoice;
    // Separate motor-drive and generating-machine buses for different
    // estimated acoustic shielding at the listener position.
    const tractionBus = this.electric.lastTraction + this.electric.lastGear +
      this.electric.lastInverter + this.electric.lastRegen;
    const generatorBus = this.electric.lastGenerator + this.electric.lastMotoring;
    const mix = this.soundstage.next(combustionVoice,
      this.iceAcoustics.motoringVoice, tractionBus, generatorBus,
      this.speed, iceProfile, listeningMode, roadRoughness);
    // DC block + bounded saturation; no sample value leaves [-0.54, +0.54].
    this.hp = mix - this.prevMix + 0.995 * this.hp;
    this.prevMix = mix;
    return Math.tanh(this.hp * 1.7) * 0.54 * this.active;
  }
}
