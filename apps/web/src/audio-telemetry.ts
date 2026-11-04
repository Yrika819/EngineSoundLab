import type { DriveState, EngineOperation, VehicleId } from "./powertrains";

/**
 * P5-A typed boundary from simulated vehicle physics to WebAudio.
 * Pure conversion: no DOM dependency, no hidden global state and no allocation
 * in the AudioWorklet's per-sample rendering loop. Prototype normalization is
 * intentionally explicit and separate from unverified OEM calibration.
 */
export type AudioListenerMode = "CABIN" | "ENGINE_BAY";

/** Discrete DSP gate codes. Do not interpolate these integer state IDs. */
export const ENGINE_OPERATION_CODES = Object.freeze({
  STOPPED: 0, STARTING: 1, RUNNING_FUELLED: 2,
  SPINNING_UNFUELLED: 3, STOPPING: 4
} as const);

export interface AudioTelemetry {
  vehicleId: VehicleId;
  engineOperation: EngineOperation;
  engineOperationCode: 0 | 1 | 2 | 3 | 4;
  engineRpm: number;
  engineRotating: boolean;
  combustionGate: 0 | 1;
  engineLoad: number;
  throttle: number;
  speedMps: number;
  tractionShaftRpm: number;
  tractionTorqueSignedNm: number;
  tractionPowerKw: number;
  motorAmplitude: number;
  regenPowerKw: number;
  regenAmplitude: number;
  generatorShaftRpm: number;
  generatorElectricalKw: number;
  generatorAmplitude: number;
  engineMotoringElectricalKw: number;
  batterySoc: number | null;
  electricProfile: 0 | 1 | 2;
  listenerMode: AudioListenerMode;
}

const bounded = (value: number, lower: number, upper: number): number =>
  Number.isFinite(value) ? Math.max(lower, Math.min(upper, value)) : lower;

export function toAudioTelemetry(
  state: DriveState,
  throttleInput = state.load,
  listenerMode: AudioListenerMode = "CABIN"
): AudioTelemetry {
  const engineRpm = bounded(state.rpm, 0, 8000);
  const operation = state.engineOperation;
  const combustionGate: 0 | 1 =
    operation === "RUNNING_FUELLED" && state.combustionActive ? 1 : 0;
  const hasMotor = state.vehicleId !== "generic_i4";
  const motorPowerKw = hasMotor && Number.isFinite(state.motorPowerKw)
    ? state.motorPowerKw : 0;
  const motorTorque = hasMotor
    ? bounded(state.tractionMotorTorqueNm, -2000, 2000) : 0;
  const regenPowerKw = hasMotor ? bounded(state.regenPowerKw, 0, 500) : 0;
  const generatorElectricalKw = hasMotor && combustionGate
    ? bounded(state.generatorPowerKw, 0, 500) : 0;
  const electricProfile: 0 | 1 | 2 = state.vehicleId === "prius_60_hev" ? 1
    : state.vehicleId === "aura_fe13_epower" ? 2 : 0;
  return {
    vehicleId: state.vehicleId,
    engineOperation: operation,
    engineOperationCode: ENGINE_OPERATION_CODES[operation],
    engineRpm,
    engineRotating: engineRpm > 30,
    combustionGate,
    engineLoad: combustionGate ? bounded(state.load, 0, 1) : 0,
    throttle: bounded(throttleInput, 0, 1),
    speedMps: bounded(state.speedMps, 0, 90),
    tractionShaftRpm: hasMotor ? bounded(Math.abs(state.mg2Rpm), 0, 22000) : 0,
    tractionTorqueSignedNm: motorTorque,
    tractionPowerKw: motorPowerKw,
    // Preserve the original P3+ sound magnitude for this interface migration.
    // P5-C will use torque sign to tune traction/regen timbre separately.
    motorAmplitude: bounded(Math.abs(motorPowerKw) / 65, 0, 1),
    regenPowerKw,
    regenAmplitude: bounded(regenPowerKw / 24, 0, 1),
    generatorShaftRpm: hasMotor ? bounded(Math.abs(state.mg1Rpm), 0, 22000) : 0,
    generatorElectricalKw,
    generatorAmplitude: bounded(generatorElectricalKw / 32, 0, 1),
    engineMotoringElectricalKw: hasMotor
      ? bounded(state.engineMotoringElectricalKw, 0, 100) : 0,
    batterySoc: hasMotor ? bounded(state.batterySoc ?? 0, 0, 1) : null,
    electricProfile,
    listenerMode
  };
}
