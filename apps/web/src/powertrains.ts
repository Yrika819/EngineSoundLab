/**
 * P2 estimated hybrid controller prototypes.
 * The "Toyota" and "Nissan" labels identify the public drivetrain topology,
 * NOT manufacturer-verified calibrations or ECU algorithms.
 */
import { clamp, initialState, step, type DriverInput, type VehicleState } from "./physics";

export type VehicleId = "generic_i4" | "prius_60_hev" | "aura_fe13_epower";
export type EnginePhase = "STOPPED" | "STARTING" | "RUNNING" | "STOPPING";

export interface DriveState extends VehicleState {
  vehicleId: VehicleId;
  enginePhase: EnginePhase;
  phaseTimeSec: number;
  combustionActive: boolean;
  batterySoc: number | null;
  batteryPowerKw: number;
  motorPowerKw: number; // + drive, - regen, mechanical at wheels
  generatorPowerKw: number; // + electrical production
  regenPowerKw: number; // + nonnegative display-only regenerated electrical power
  engineMechanicalKw: number; // mechanical engine supply, includes generator input
  mg1Rpm: number;
  mg2Rpm: number;
}

const MASS_KG = 1470; // placeholder for simulation, not verified model spec
const TYRE_RADIUS_M = 0.31; // estimated
const AIR_DENSITY = 1.225;
const CDA = 0.66; // estimated drag-area
const ROLLING_FACTOR = 0.012; // estimated
const BATTERY_KWH = 1.3; // usable capacity placeholder, NOT manufacturer total kWh
const MOTOR_EFFICIENCY = 0.90;
const REGEN_EFFICIENCY = 0.78;
const GENERATOR_EFFICIENCY = 0.87;
const AUXILIARY_KW = 0.25;
const SOC_MIN = 0.16;
const SOC_MAX = 0.86;

export function makeDriveState(vehicleId: VehicleId): DriveState {
  const base = initialState();
  return {
    ...base, vehicleId,
    rpm: vehicleId === "generic_i4" ? base.rpm : 0,
    enginePhase: vehicleId === "generic_i4" ? "RUNNING" : "STOPPED",
    phaseTimeSec: 0,
    combustionActive: vehicleId === "generic_i4",
    batterySoc: vehicleId === "generic_i4" ? null : 0.63,
    batteryPowerKw: 0,
    motorPowerKw: 0,
    generatorPowerKw: 0,
    regenPowerKw: 0,
    engineMechanicalKw: 0,
    mg1Rpm: 0,
    mg2Rpm: 0
  };
}

function advancePhase(
  state: DriveState, request: boolean, dt: number
): { phase: EnginePhase; phaseTimeSec: number } {
  let phase = state.enginePhase;
  let elapsed = state.phaseTimeSec + dt;
  if (phase === "STOPPED" && request) { phase = "STARTING"; elapsed = 0; }
  else if (phase === "STARTING" && elapsed >= 0.55) { phase = "RUNNING"; elapsed = 0; }
  else if (phase === "RUNNING" && !request && elapsed >= 4.5) {
    phase = "STOPPING"; elapsed = 0;
  }
  else if (phase === "STOPPING" && elapsed >= 0.85) {
    phase = "STOPPED"; elapsed = 0;
  }
  // Do not oscillate between STARTING and STOPPED during a transient.
  return { phase, phaseTimeSec: elapsed };
}

function rpmTowards(previous: number, target: number, dt: number): number {
  const tau = target > previous ? 0.34 : 0.55;
  return Math.max(0, previous + (target - previous) * (1 - Math.exp(-dt / tau)));
}

function driveForces(speedMps: number, driveForceN: number, brake: number): {
  accelerationMps2: number; nextBrakeN: number; regenForceN: number
} {
  const rollingN = speedMps > 0.02 ? MASS_KG * 9.81 * ROLLING_FACTOR : 0;
  const dragN = 0.5 * AIR_DENSITY * CDA * speedMps * speedMps;
  const nextBrakeN = brake * 7600;
  const regenForceN = speedMps > 0.6 ? Math.min(nextBrakeN, 1800) : 0;
  const totalBrakeN = nextBrakeN; // regen replaces friction; does not add to it
  const a = clamp((driveForceN - rollingN - dragN - totalBrakeN) / MASS_KG, -6, 4.2);
  return { accelerationMps2: a, nextBrakeN, regenForceN };
}

function integrateSoc(previous: number, batteryPowerKw: number, dt: number): number {
  // P_battery>0 discharges. Electrical outputs are checked separately.
  return clamp(previous - batteryPowerKw * dt / (3600 * BATTERY_KWH), SOC_MIN, SOC_MAX);
}

function simulateHybrid(state: DriveState, controls: DriverInput, dt: number): DriveState {
  const gas = clamp(controls.throttle, 0, 1);
  const brake = clamp(controls.brake, 0, 1);
  const speed = state.speedMps;
  const soc = state.batterySoc ?? 0.63;
  const isSeries = state.vehicleId === "aura_fe13_epower";

  // Engineering approximation of the request and hysteresis. Engine RPM is NOT
  // mechanically coupled to wheels in e-POWER.
  const wheelRpm = speed / (2 * Math.PI * TYRE_RADIUS_M) * 60;
  const ringRpm = wheelRpm * 3.0; // illustrative final output ratio
  const targetRequest = isSeries
    ? (soc < (state.enginePhase === "RUNNING" ? 0.66 : 0.52) ||
       (gas > (state.enginePhase === "RUNNING" ? 0.34 : 0.7) && soc < 0.79))
    : (soc < (state.enginePhase === "RUNNING" ? 0.64 : 0.50) ||
       gas > (state.enginePhase === "RUNNING" ? 0.23 : 0.43) ||
       (speed > 18 && gas > 0.13) ||
       (Math.abs(-2.6 * ringRpm) > 6800));

  const { phase, phaseTimeSec } = advancePhase(state, targetRequest, dt);
  const running = phase === "RUNNING";

  // Different engine targets: series HEV follows generation demand; power-split
  // follows load/SOC while satisfying an illustrative MG1 speed constraint.
  const targetEngineRpm = phase === "STOPPED" ? 0 : phase === "STOPPING" ? 0 :
    phase === "STARTING" ? 1200 : isSeries
      ? clamp(1550 + gas * 950 + Math.max(0, 0.63 - soc) * 6500, 1250, 4100)
      : clamp(1150 + gas * 2650 + speed * 24 +
              Math.max(0, 0.58 - soc) * 4300, 1100, 5000);
  const rpm = rpmTowards(state.rpm, targetEngineRpm, dt);

  let requestedForce = (isSeries ? 4600 : 4400) * gas;
  // Low battery reduces motor capability until generator / mechanical path arrives.
  const lowSocLimiter = soc <= SOC_MIN + 0.015 ? 0.35 : soc <= 0.23 ? 0.64 : 1;
  const motorMaxN = Math.min(isSeries ? 4700 : 2400, (isSeries ? 83000 : 57000) / Math.max(3, speed));
  let motorForceN = Math.min(requestedForce, motorMaxN * lowSocLimiter);
  let engineForceN = 0;
  if (!isSeries && running) {
    // Prius can send engine power mechanically through the power split.
    engineForceN = Math.min(Math.max(0, requestedForce - motorForceN),
      2800, 69000 / Math.max(3, speed));
  }
  if (brake > 0.01) { motorForceN *= 1 - brake; engineForceN *= 1 - brake; }
  const driveForceN = motorForceN + engineForceN;
  const resistance = driveForces(speed, driveForceN, brake);
  const newSpeed = Math.max(0, speed + resistance.accelerationMps2 * dt);

  // Negative motor mechanical power represents regeneration (no double count).
  const regenMechKw = -resistance.regenForceN * speed / 1000;
  const motorPowerKw = motorForceN * speed / 1000 + regenMechKw;
  const motorElectricalKw = motorPowerKw >= 0
    ? motorPowerKw / MOTOR_EFFICIENCY
    : motorPowerKw * REGEN_EFFICIENCY;

  let generatorPowerKw = 0;
  let engineMechanicalKw = 0;
  if (running) {
    if (isSeries) {
      // Charge sustaining series HEV: engine output only powers generator.
      const targetGenerated = clamp(
        9 + 18 * gas + Math.max(0, 0.65 - soc) * 120,
        8, 48
      );
      generatorPowerKw = targetGenerated;
      engineMechanicalKw = generatorPowerKw / GENERATOR_EFFICIENCY;
    } else {
      generatorPowerKw = clamp(1.5 + Math.max(0, 0.64 - soc) * 65 +
          (gas < 0.2 ? 1.0 : 0), 0, 13);
      const engineWheelKw = engineForceN * speed / 1000;
      engineMechanicalKw = engineWheelKw / 0.91 + generatorPowerKw / GENERATOR_EFFICIENCY;
    }
  }
  // Battery electric power >0 discharge, <0 charging.
  const batteryPowerKw = motorElectricalKw + AUXILIARY_KW - generatorPowerKw;
  const batterySoc = integrateSoc(soc, batteryPowerKw, dt);
  const engineLoad = running ? clamp(engineMechanicalKw / (isSeries ? 57 : 85), 0.06, 1) : 0;

  // The Prius planetary relation (illustrative gearset; not OEM tooth counts):
  // (Ns + Nr) * carrier = Ns * sun + Nr * ring.
  const ns = 30, nr = 78;
  // Telemetry must be consistent with the velocity at the END of this step.
  const updatedWheelRpm = newSpeed / (2 * Math.PI * TYRE_RADIUS_M) * 60;
  const updatedRingRpm = updatedWheelRpm * 3.0;
  const mg1Rpm = isSeries ? (running ? rpm : 0)
    : ((ns + nr) * rpm - nr * updatedRingRpm) / ns;

  return {
    ...state,
    timeSec: state.timeSec + dt,
    speedMps: newSpeed,
    rpm, load: engineLoad,
    accelerationMps2: newSpeed === 0 && resistance.accelerationMps2 < 0
      ? 0 : resistance.accelerationMps2,
    gear: 1, // D: hybrid has no stepped mechanical gearbox in this model.
    enginePhase: phase,
    phaseTimeSec,
    combustionActive: running,
    batterySoc, batteryPowerKw,
    motorPowerKw, generatorPowerKw,
    regenPowerKw: Math.max(0, -regenMechKw * REGEN_EFFICIENCY),
    engineMechanicalKw,
    mg1Rpm, mg2Rpm: isSeries ? updatedWheelRpm * 7.2 : updatedRingRpm
  };
}

export function advanceDrive(state: DriveState, input: DriverInput, dt: number): DriveState {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05)
    throw new RangeError("hybrid simulation step must be in (0,0.05]");
  if (state.vehicleId !== "generic_i4") return simulateHybrid(state, input, dt);
  const regular = step(state, input, dt);
  return {
    ...state, ...regular,
    enginePhase: "RUNNING", combustionActive: true,
    batterySoc: null, batteryPowerKw: 0,
    motorPowerKw: 0, generatorPowerKw: 0,
    regenPowerKw: 0, engineMechanicalKw: 0,
    mg1Rpm: 0, mg2Rpm: 0
  };
}
