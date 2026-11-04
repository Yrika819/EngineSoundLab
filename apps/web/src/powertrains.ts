/**
 * P5-A: independently model engine rotation, combustion and battery power.
 * All thresholds, energy capacities and gear ratios below are prototype
 * estimates, not Toyota/Nissan ECU maps or manufacturer-verified calibration.
 */
import { clamp, initialState, step, type DriverInput, type VehicleState } from "./physics";

export type VehicleId = "generic_i4" | "prius_60_hev" | "aura_fe13_epower";
export type EnginePhase = "STOPPED" | "STARTING" | "RUNNING" | "STOPPING";
export type EngineOperation =
  "STOPPED" | "STARTING" | "RUNNING_FUELLED" |
  "SPINNING_UNFUELLED" | "STOPPING";

export interface DriveState extends VehicleState {
  vehicleId: VehicleId;
  enginePhase: EnginePhase; // legacy cockpit label; use engineOperation for sound
  engineOperation: EngineOperation;
  phaseTimeSec: number;
  combustionActive: boolean;
  batterySoc: number | null;
  batteryPowerKw: number; // positive = discharge, negative = charging
  motorPowerKw: number; // signed mechanical power at wheels, +/- drive/regen
  tractionMotorTorqueNm: number; // shaft torque; negative = regen, approximate
  generatorPowerKw: number; // positive electrical production, zero when inactive
  regenPowerKw: number; // positive recovered electrical power (display only)
  engineMechanicalKw: number; // only fuelled engine output; includes generator
  engineMotoringElectricalKw: number; // electric draw for non-fuelled rotation
  mg1Rpm: number;
  mg2Rpm: number;
}

const MASS_KG = 1470;
const TYRE_RADIUS_M = 0.31;
const AIR_DENSITY = 1.225;
const CDA = 0.66;
const ROLLING_FACTOR = 0.012;
const BATTERY_KWH = 1.3; // usable capacity PLACEHOLDER, not official total
const MOTOR_EFFICIENCY = 0.90;
const REGEN_EFFICIENCY = 0.78;
const GENERATOR_EFFICIENCY = 0.87;
const AUXILIARY_KW = 0.25;
export const SOC_MIN = 0.16;
export const SOC_MAX = 0.86;
const MAX_BATTERY_DISCHARGE_KW = 55; // illustrative available power
const MAX_BATTERY_CHARGE_KW = 30; // illustrative charge acceptance
const MAX_UNFUELLED_ENGINE_DRAW_KW = 5; // illustrative regen dissipation
const PRIUS_MOTOR_GEAR = 3.0; // illustrative mechanical ratio
const AURA_MOTOR_GEAR = 7.2; // illustrative reduction ratio

/** Power caps include available energy in the current time step.
 * Limits are applied to loads/generation BEFORE SOC integration, not by
 * silently clipping SOC after consuming/producing energy.
 */
export function batteryPowerLimits(soc: number, dt: number) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05) throw new RangeError("invalid dt");
  const safeSoc = clamp(soc, SOC_MIN, SOC_MAX);
  const kwhPerStep = BATTERY_KWH * 3600 / dt;
  return {
    dischargeKw: Math.max(0, Math.min(MAX_BATTERY_DISCHARGE_KW,
      (safeSoc - SOC_MIN) * kwhPerStep)),
    chargeKw: Math.max(0, Math.min(MAX_BATTERY_CHARGE_KW,
      (SOC_MAX - safeSoc) * kwhPerStep))
  };
}

export function makeDriveState(vehicleId: VehicleId): DriveState {
  const base = initialState();
  const generic = vehicleId === "generic_i4";
  return {
    ...base, vehicleId,
    rpm: generic ? base.rpm : 0,
    enginePhase: generic ? "RUNNING" : "STOPPED",
    engineOperation: generic ? "RUNNING_FUELLED" : "STOPPED",
    phaseTimeSec: 0,
    combustionActive: generic,
    batterySoc: generic ? null : 0.63,
    batteryPowerKw: 0,
    motorPowerKw: 0,
    tractionMotorTorqueNm: 0,
    generatorPowerKw: 0,
    regenPowerKw: 0,
    engineMechanicalKw: 0,
    engineMotoringElectricalKw: 0,
    mg1Rpm: 0,
    mg2Rpm: 0
  };
}

function advancePhase(
  state: DriveState, request: boolean, dt: number
): { phase: EnginePhase; phaseTimeSec: number } {
  let phase = state.enginePhase;
  let elapsed = state.phaseTimeSec + dt;
  if (state.engineOperation === "SPINNING_UNFUELLED") {
    // A motor-driven unfuelled rotation ends in a normal silent stopping
    // transition unless the controller explicitly requests combustion.
    phase = request ? "STARTING" : "STOPPING";
    elapsed = 0;
  } else if (phase === "STOPPED" && request) { phase = "STARTING"; elapsed = 0; }
  else if (phase === "STARTING" && elapsed >= 0.55) { phase = "RUNNING"; elapsed = 0; }
  else if (phase === "RUNNING" && !request && elapsed >= 4.5) {
    phase = "STOPPING"; elapsed = 0;
  } else if (phase === "STOPPING" && elapsed >= 0.85) {
    phase = "STOPPED"; elapsed = 0;
  }
  return { phase, phaseTimeSec: elapsed };
}

function rpmTowards(previous: number, target: number, dt: number): number {
  const tau = target > previous ? 0.34 : 0.55;
  return Math.max(0, previous + (target - previous) * (1 - Math.exp(-dt / tau)));
}

function simulateHybrid(state: DriveState, controls: DriverInput, dt: number): DriveState {
  const gas = clamp(controls.throttle, 0, 1);
  const brake = clamp(controls.brake, 0, 1);
  const speed = state.speedMps;
  const soc = clamp(state.batterySoc ?? 0.63, SOC_MIN, SOC_MAX);
  const isSeries = state.vehicleId === "aura_fe13_epower";
  const limits = batteryPowerLimits(soc, dt);
  const wheelRpm = speed / (2 * Math.PI * TYRE_RADIUS_M) * 60;
  const ringRpm = wheelRpm * PRIUS_MOTOR_GEAR;
  const previousRunning = state.enginePhase === "RUNNING" &&
    state.engineOperation === "RUNNING_FUELLED";

  const engineRequested = isSeries
    ? (soc < (previousRunning ? 0.66 : 0.52) ||
       (gas > (previousRunning ? 0.34 : 0.7) && soc < 0.79))
    : (soc < (previousRunning ? 0.64 : 0.50) ||
       gas > (previousRunning ? 0.23 : 0.43) ||
       (speed > 18 && gas > 0.13) ||
       (Math.abs(-2.6 * ringRpm) > 6800));

  // Illustrative non-fuelled engine braking scenario under high SOC.
  // For series e-POWER, regenerated electricity can spin the generator/ICE
  // to dissipate energy without a mechanical engine-to-wheel connection.
  // NOT a claimed FE13 factory threshold or exact braking strategy.
  const unfuelled = isSeries && speed > 10 && brake > 0.45 && soc >= 0.80;
  let phase: EnginePhase, phaseTimeSec: number;
  if (unfuelled) {
    phase = "RUNNING";
    phaseTimeSec = 0;
  } else {
    const result = advancePhase(state, engineRequested, dt);
    phase = result.phase;
    phaseTimeSec = result.phaseTimeSec;
  }
  const operation: EngineOperation = unfuelled ? "SPINNING_UNFUELLED"
    : phase === "RUNNING" ? "RUNNING_FUELLED"
    : phase === "STARTING" ? "STARTING"
    : phase === "STOPPING" ? "STOPPING" : "STOPPED";
  const fuelled = operation === "RUNNING_FUELLED";

  const targetEngineRpm = operation === "STOPPED" || operation === "STOPPING" ? 0
    : operation === "STARTING" ? 1200
    : operation === "SPINNING_UNFUELLED" ? clamp(900 + speed * 55, 900, 2200)
    : isSeries
      ? clamp(1550 + gas * 950 + Math.max(0, 0.63 - soc) * 6500, 1250, 4100)
      : clamp(1150 + gas * 2650 + speed * 24 +
              Math.max(0, 0.58 - soc) * 4300, 1100, 5000);
  const rpm = rpmTowards(state.rpm, targetEngineRpm, dt);

  // Estimate initial generator capability. A series HEV can drive wheels only
  // through its electric motor, regardless of engine running state.
  let requestedGenKw = 0;
  if (fuelled) {
    requestedGenKw = isSeries
      ? clamp(9 + 18 * gas + Math.max(0, 0.65 - soc) * 120, 8, 48)
      : clamp(1.5 + Math.max(0, 0.64 - soc) * 65 +
          (gas < 0.2 ? 1 : 0), 0, 13);
  }

  // Braking input overrides propulsion in the prototype; otherwise positive
  // and negative wheel power could cancel and misstate motor electricity.
  const requestForce = (isSeries ? 4600 : 4400) * gas;
  const motorMaxN = Math.min(isSeries ? 4700 : 2400,
    (isSeries ? 83000 : 57000) / Math.max(3, speed));
  let motorForceN = brake > 0.01 ? 0 : Math.min(requestForce, motorMaxN);
  // Traction must be powered by available battery + generator generation,
  // taking the auxiliary draw into account.
  const affordableMotorElectrical = Math.max(0,
    limits.dischargeKw + requestedGenKw - AUXILIARY_KW);
  const maxMotorForceByEnergy = affordableMotorElectrical * MOTOR_EFFICIENCY *
    1000 / Math.max(speed, 0.5);
  motorForceN = Math.min(motorForceN, maxMotorForceByEnergy);
  let engineForceN = 0;
  if (!isSeries && fuelled && brake <= 0.01) {
    engineForceN = Math.min(Math.max(0, requestForce - motorForceN),
      2800, 69000 / Math.max(3, speed));
  }

  const motorTractionKw = motorForceN * speed / 1000;
  const motorTractionElectricalKw = motorTractionKw / MOTOR_EFFICIENCY;
  const targetBrakeForceN = brake * 7600;
  const proposedRegenN = speed > 0.6 ? Math.min(targetBrakeForceN, 1800) : 0;
  const proposedRegenElectricalKw = proposedRegenN * speed / 1000 * REGEN_EFFICIENCY;
  // Optional unfuelled motor-driven engine drag is a *consumer* of
  // regeneratively produced electricity, not positive generation.
  const engineMotoringElectricalKw = unfuelled
    ? Math.min(MAX_UNFUELLED_ENGINE_DRAW_KW, proposedRegenElectricalKw) : 0;
  const extraLoadKw = motorTractionElectricalKw + AUXILIARY_KW +
    engineMotoringElectricalKw;
  const availableRegenElectricalKw = Math.max(0,
    limits.chargeKw + extraLoadKw - requestedGenKw);
  const regenForceN = Math.min(proposedRegenN,
    availableRegenElectricalKw * 1000 /
      (Math.max(speed, 0.01) * REGEN_EFFICIENCY));
  const regenMechanicalKw = regenForceN * speed / 1000;
  const regenElectricalKw = regenMechanicalKw * REGEN_EFFICIENCY;

  // Generation cannot exceed concurrent loads plus battery charge acceptance.
  const motorElectricalKw = motorTractionElectricalKw - regenElectricalKw;
  const auxiliaryKw = Math.min(AUXILIARY_KW,
    Math.max(0, limits.dischargeKw + requestedGenKw +
      regenElectricalKw - motorTractionElectricalKw - engineMotoringElectricalKw));
  const generatorPowerKw = Math.min(requestedGenKw, Math.max(0,
    limits.chargeKw + motorElectricalKw + auxiliaryKw + engineMotoringElectricalKw));
  const batteryPowerKw = motorElectricalKw + auxiliaryKw +
    engineMotoringElectricalKw - generatorPowerKw;

  // Invariant: battery power is inside both the instantaneous battery hardware
  // envelope and the energy-per-step headroom. SOC clipping is only for
  // floating-point round-off, not to hide uncontrolled energy.
  const batterySoc = clamp(soc - batteryPowerKw * dt / (3600 * BATTERY_KWH),
    SOC_MIN, SOC_MAX);

  const totalBrakeN = targetBrakeForceN; // friction substitutes for limited regen
  const rollingN = speed > 0.02 ? MASS_KG * 9.81 * ROLLING_FACTOR : 0;
  const aeroN = 0.5 * AIR_DENSITY * CDA * speed * speed;
  const rawAccel = (motorForceN + engineForceN - totalBrakeN -
    rollingN - aeroN) / MASS_KG;
  const acceleration = clamp(rawAccel, -6, 4.2);
  const newSpeed = Math.max(0, speed + acceleration * dt);

  const engineWheelKw = engineForceN * speed / 1000;
  const engineMechanicalKw = fuelled
    ? engineWheelKw / 0.91 + generatorPowerKw / GENERATOR_EFFICIENCY : 0;
  const engineLoad = fuelled
    ? clamp(engineMechanicalKw / (isSeries ? 57 : 85), 0.06, 1) : 0;
  const updatedWheelRpm = newSpeed / (2 * Math.PI * TYRE_RADIUS_M) * 60;
  const updatedRingRpm = updatedWheelRpm * PRIUS_MOTOR_GEAR;
  const ns = 30, nr = 78; // illustrative tooth counts, NOT Toyota OEM specs
  const mg1Rpm = isSeries ? (operation === "STOPPED" ? 0 : rpm)
    : ((ns + nr) * rpm - nr * updatedRingRpm) / ns;
  const motorGear = isSeries ? AURA_MOTOR_GEAR : PRIUS_MOTOR_GEAR;
  const motorShaftTorqueNm = (motorForceN - regenForceN) *
    TYRE_RADIUS_M / motorGear;

  return {
    ...state,
    timeSec: state.timeSec + dt,
    speedMps: newSpeed,
    rpm, load: engineLoad,
    accelerationMps2: newSpeed === 0 && acceleration < 0 ? 0 : acceleration,
    gear: 1,
    enginePhase: phase,
    engineOperation: operation,
    phaseTimeSec,
    combustionActive: fuelled,
    batterySoc, batteryPowerKw,
    motorPowerKw: motorTractionKw - regenMechanicalKw,
    tractionMotorTorqueNm: motorShaftTorqueNm,
    generatorPowerKw,
    regenPowerKw: regenElectricalKw,
    engineMechanicalKw,
    engineMotoringElectricalKw,
    mg1Rpm, mg2Rpm: updatedWheelRpm * motorGear
  };
}

export function advanceDrive(state: DriveState, input: DriverInput, dt: number): DriveState {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05)
    throw new RangeError("hybrid simulation step must be in (0,0.05]");
  if (state.vehicleId !== "generic_i4") return simulateHybrid(state, input, dt);
  const regular = step(state, input, dt);
  return {
    ...state, ...regular,
    enginePhase: "RUNNING", engineOperation: "RUNNING_FUELLED",
    combustionActive: true, batterySoc: null, batteryPowerKw: 0,
    motorPowerKw: 0, tractionMotorTorqueNm: 0,
    generatorPowerKw: 0, regenPowerKw: 0,
    engineMechanicalKw: 0, engineMotoringElectricalKw: 0,
    mg1Rpm: 0, mg2Rpm: 0
  };
}
