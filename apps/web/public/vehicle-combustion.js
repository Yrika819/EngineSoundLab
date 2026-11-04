/**
 * P5-B real-time combustion and crankshaft acoustics.
 *
 * EngineSoundLab original procedural synthesis. Vehicle names identify
 * physical topology and qualitative NVH targets, NOT measured pressure
 * waveforms, manufacturer ECU maps or factory cabin EQ calibration.
 *
 * Three independent source classes:
 *   - fuelled combustion: discrete 720-degree four-stroke firing events;
 *   - inducted air and exhaust duct resonances: separate filters/envelopes;
 *   - unfuelled crankshaft / starter rotation: NOT gated by combustion.
 *
 * This is an acoustic simulation, not a recording or a replica of OEM AVAS.
 */
export const ICE_VOICES = Object.freeze({
  PRIUS_20: Object.freeze({
    label: "Prius 60 / M20A-FXS (qualitative synthesis)",
    cylinders: 4,
    firingOrder: 2, // mean firing pulses per crank revolution, 4-stroke
    lowExhaustHz: 98, exhaustMidHz: 204,
    cabinNotchHz: 365, cabinNotchDb: -4.8, cabinNotchQ: 0.78,
    intakeGain: 0.036, mechanicalGain: 0.022,
    exhaustGain: 0.82, highRaspGain: 0.38, lowRumbleGain: 1.09
  }),
  AURA_12: Object.freeze({
    label: "Aura FE13 / HR12DE (qualitative synthesis)",
    cylinders: 3,
    firingOrder: 1.5,
    lowExhaustHz: 83, exhaustMidHz: 267,
    cabinNotchHz: 365, cabinNotchDb: -1.5, cabinNotchQ: 0.98,
    intakeGain: 0.025, mechanicalGain: 0.015,
    exhaustGain: 0.66, highRaspGain: 0.24, lowRumbleGain: 0.85
  })
});

const clamp = (value, lo, hi) =>
  Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : lo;
const FOURS = Object.freeze({
  i3: Object.freeze([0, 240, 480]),
  i4: Object.freeze([0, 180, 360, 540]),
  i6: Object.freeze([0, 120, 240, 360, 480, 600])
});
const TAU = Math.PI * 2;

/** Fixed, bounded second-order air/exhaust resonator. */
class DuctResonator {
  constructor(rate, hz, radius = 0.965) {
    this.a = 2 * radius * Math.cos(TAU * hz / rate);
    this.b = radius * radius;
    this.gain = 1 - radius;
    this.a1 = 0;
    this.a2 = 0;
  }
  process(signal) {
    const value = this.a * this.a1 - this.b * this.a2 + this.gain * signal;
    this.a2 = this.a1;
    this.a1 = value;
    return value;
  }
}

/** Stable peaking biquad; coefficients are computed ONCE, not per sample. */
class CabinEqualizer {
  constructor(rate, hz, db, q) {
    const A = Math.pow(10, db / 40);
    const w0 = TAU * hz / rate;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0;
    this.b1 = (-2 * Math.cos(w0)) / a0;
    this.b2 = (1 - alpha * A) / a0;
    this.a1 = (-2 * Math.cos(w0)) / a0;
    this.a2 = (1 - alpha / A) / a0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 +
      this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

export const ENGINE_OPERATIONS = Object.freeze({
  STOPPED: 0, STARTING: 1, RUNNING_FUELLED: 2,
  SPINNING_UNFUELLED: 3, STOPPING: 4
});

export class VehicleCombustionSynth {
  constructor(rate = 48000, seed = 0x5bd1e995, cylinderProfile = "i4") {
    if (!Number.isFinite(rate) || rate < 8000 || rate > 192000)
      throw new RangeError("invalid sample rate");
    this.rate = rate;
    this.seed = (seed >>> 0) || 1;
    this.crankAngle = 0;
    this.nextFiring = 0;
    this.firingEvents = 0;
    this.rpm = 850;
    this.load = 0;
    this.throttle = 0;
    this.combustion = 0;
    this.motoring = 0;
    this.auraMix = 0;
    this.fireFast = 0;
    this.fireBody = 0;
    this.fireSub = 0;
    this.intakeLp = 0;
    this.intakeHp = 0;
    this.lastIntakeLp = 0;
    this.exhaustSmooth = 0;
    this.mechSmooth = 0;
    this.lagRpm = Math.exp(-1 / (rate * 0.035));
    this.lagLoad = Math.exp(-1 / (rate * 0.048));
    this.lagThrottle = Math.exp(-1 / (rate * 0.039));
    this.lagGate = Math.exp(-1 / (rate * 0.025));
    this.lagMode = Math.exp(-1 / (rate * 0.095));
    this.fastDecay = Math.exp(-1 / (rate * 0.0011));
    this.bodyDecay = Math.exp(-1 / (rate * 0.010));
    this.subDecay = Math.exp(-1 / (rate * 0.035));
    const prius = ICE_VOICES.PRIUS_20, aura = ICE_VOICES.AURA_12;
    this.priusLow = new DuctResonator(rate, prius.lowExhaustHz, 0.974);
    this.priusMid = new DuctResonator(rate, prius.exhaustMidHz, 0.951);
    this.auraLow = new DuctResonator(rate, aura.lowExhaustHz, 0.969);
    this.auraMid = new DuctResonator(rate, aura.exhaustMidHz, 0.940);
    this.priusEq = new CabinEqualizer(
      rate, prius.cabinNotchHz, prius.cabinNotchDb, prius.cabinNotchQ);
    this.auraEq = new CabinEqualizer(
      rate, aura.cabinNotchHz, aura.cabinNotchDb, aura.cabinNotchQ);
    this.setCylinderProfile(cylinderProfile);
  }

  setCylinderProfile(id) {
    const events = Object.hasOwn(FOURS, id) ? FOURS[id] : null;
    if (!events) throw new RangeError("unsupported firing profile: " + id);
    this.cylinderProfile = id;
    this.firingAngles = events;
    // On live switch preserve continuous crank position, but do not invent a
    // past firing in the same cycle or count two simultaneous ignitions.
    let next = 0;
    while (next < events.length && events[next] < this.crankAngle - 1e-7) next++;
    this.nextFiring = next;
  }

  random() {
    let x = this.seed;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 2147483648 - 1;
  }

  /**
   * @param {number} rpmTarget crankshaft RPM (independent of vehicle speed)
   * @param {number} loadTarget engine fuelled mechanical load, [0,1]
   * @param {number} throttleTarget requested driver throttle, [0,1]
   * @param {number} combustionTarget gate, independent of rotating shaft
   * @param {number} operationCode ENGINE_OPERATIONS integer
   * @param {number} vehicleCode 1 Prius, 2 Aura
   */
  next(rpmTarget, loadTarget, throttleTarget, combustionTarget,
       operationCode = ENGINE_OPERATIONS.RUNNING_FUELLED, vehicleCode = 1) {
    const rpm = clamp(rpmTarget, 0, 8000);
    const load = clamp(loadTarget, 0, 1);
    const throttle = clamp(throttleTarget, 0, 1);
    const operation = clamp(operationCode, 0, 4);
    const vehicle = Math.round(clamp(vehicleCode, 1, 2));
    this.rpm = this.rpm * this.lagRpm + rpm * (1 - this.lagRpm);
    this.load = this.load * this.lagLoad + load * (1 - this.lagLoad);
    this.throttle = this.throttle * this.lagThrottle +
      throttle * (1 - this.lagThrottle);
    // Non-fuelled rotating engine produces starter/crank sound, not exhaust
    // ignition pulses. No retroactive ignition while the RPM ramps.
    const fuelled = operation === ENGINE_OPERATIONS.RUNNING_FUELLED
      ? clamp(combustionTarget, 0, 1) : 0;
    const motoring = operation === ENGINE_OPERATIONS.STARTING ||
      operation === ENGINE_OPERATIONS.SPINNING_UNFUELLED ||
      operation === ENGINE_OPERATIONS.STOPPING ? 1 : 0;
    this.combustion = this.combustion * this.lagGate +
      (1 - this.lagGate) * fuelled;
    this.motoring = this.motoring * this.lagGate +
      (1 - this.lagGate) * motoring;
    this.auraMix = this.auraMix * this.lagMode +
      (1 - this.lagMode) * (vehicle === 2 ? 1 : 0);

    const increment = this.rpm * 6 / this.rate;
    this.crankAngle += increment;
    if (this.crankAngle >= 720) {
      this.crankAngle -= 720;
      this.nextFiring = 0;
    }
    if (this.nextFiring < this.firingAngles.length &&
        this.crankAngle >= this.firingAngles[this.nextFiring]) {
      const i = this.nextFiring;
      // Tiny deterministic cylinder-to-cylinder variation; combustion
      // amplitude follows RPM/load, not raw throttle alone.
      const imbalance = [1.0, 0.974, 1.025, 0.982, 1.011, 0.968][i];
      const energy = (0.37 + 0.57 * this.load + 0.06 * this.throttle) *
        imbalance * this.combustion;
      this.fireFast += energy;
      this.fireBody += energy;
      this.fireSub += energy;
      if (this.combustion > 0.12) this.firingEvents++;
      this.nextFiring++;
    }

    this.fireFast *= this.fastDecay;
    this.fireBody *= this.bodyDecay;
    this.fireSub *= this.subDecay;
    const pressureEdge = this.fireBody - this.fireFast;
    const pressureBody = this.fireSub - this.fireBody;
    const source = (0.78 * pressureEdge + 0.24 * pressureBody);

    // Two independently resonant representations of the intake/exhaust
    // path, avoiding a single metallic sine tone at all engine speeds.
    const priusRes = 0.23 * this.priusLow.process(source) +
      0.055 * this.priusMid.process(source);
    const auraRes = 0.17 * this.auraLow.process(source) +
      0.073 * this.auraMid.process(source);
    this.exhaustSmooth += 0.17 * (source - this.exhaustSmooth);
    const rasp = source - this.exhaustSmooth;
    const blend = this.auraMix;
    const exhaust = (1 - blend) *
      (1.09 * (0.26 * this.exhaustSmooth + priusRes) +
       0.38 * 0.095 * this.load * rasp) +
      blend *
      (0.85 * (0.21 * this.exhaustSmooth + auraRes) +
       0.24 * 0.095 * this.load * rasp);

    const white = this.random();
    const airHz = 210 + 0.16 * this.rpm + 1300 * this.throttle;
    const airAlpha = Math.min(0.60, TAU * airHz / this.rate);
    this.intakeLp += airAlpha * (white - this.intakeLp);
    const intake = this.intakeLp * (0.014 + 0.052 * this.throttle +
      0.045 * this.load) * (0.85 - 0.17 * blend) * this.combustion;

    const crank = this.crankAngle * Math.PI / 180;
    const order = this.firingAngles.length / 2;
    // Engine-driven valve and reciprocating mass tones are not independent
    // pitched oscillators: their phase remains locked to crank geometry.
    const rotating = Math.sin(crank * 2 + 0.23) +
      0.26 * Math.sin(crank * (order + 1) + 1.0);
    const mechanical = rotating *
      (0.011 + 0.012 * this.load) * this.combustion *
      (1 - 0.24 * blend);

    // The crank, starter and connected machine can spin with zero fuel.
    // No intake/exhaust ignition impulses are introduced in this state.
    const motorWhirr = (Math.sin(crank * 1.5 + 0.16) +
      0.22 * Math.sin(crank * 5 + 0.7)) *
      0.014 * this.motoring * Math.min(1, this.rpm / 1250);
    this.mechSmooth += 0.016 * (this.random() - this.mechSmooth);
    const starter = this.mechSmooth * 0.014 * this.motoring *
      Math.min(1, this.rpm / 1500);

    // Two static cabin voicings act on the SAME physical excitation. Blending
    // prevents hard clicks on live Prius/Aura switches. This is a qualitative
    // attenuation in the 200–600 Hz region, not an OEM measured EQ curve.
    const raw = exhaust + intake + mechanical + motorWhirr + starter;
    const prius = this.priusEq.process(raw);
    const aura = this.auraEq.process(raw);
    return (1 - blend) * prius + blend * aura;
  }
}
