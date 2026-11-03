import type { DriveState, VehicleId } from "./powertrains";

export type GaugeMode = "AUTO" | "SPORT" | "ENGINEERING" | "AURA_ENHANCED";
export type GaugeLayout = "PRIUS" | "AURA_CLASSIC" | "AURA_ENHANCED" | "SPORT" | "ENGINEERING";

export interface GaugeSnapshot {
  layout: GaugeLayout;
  speedKmh: number;
  engineRpm: number;
  motorRpm: number;
  socPct: number | null;
  zone: "CHARGE" | "ECO" | "POWER";
  chargeFraction: number;
  driveFraction: number;
  engineRunning: boolean;
  engineState: string;
  batteryPowerKw: number;
  motorPowerKw: number;
  generatorPowerKw: number;
  regenPowerKw: number;
  energyFlow: string;
}

/** A style selector changes only the display, not vehicle physics or audio. */
export function resolveGaugeLayout(vehicle: VehicleId, selected: GaugeMode): GaugeLayout {
  if (selected === "ENGINEERING" || selected === "SPORT") return selected;
  if (vehicle === "prius_60_hev") return "PRIUS";
  if (vehicle === "aura_fe13_epower")
    return selected === "AURA_ENHANCED" ? "AURA_ENHANCED" : "AURA_CLASSIC";
  return "SPORT";
}

function bounded(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Normalized display mapping, deliberately NOT a factory gauge calibration.
 * CHARGE gets its own left-hand scale. Positive propulsion power is shown on
 * the right. The meter does not pretend to know proprietary ECU thresholds.
 */
export function makeGaugeSnapshot(
  drive: DriveState, selected: GaugeMode = "AUTO"
): GaugeSnapshot {
  const layout = resolveGaugeLayout(drive.vehicleId, selected);
  const regenPower = bounded(drive.regenPowerKw, 0, 100);
  const generatorElectrical = bounded(drive.generatorPowerKw, 0, 150);
  const engineToWheel = drive.vehicleId === "prius_60_hev"
    ? Math.max(0, drive.engineMechanicalKw - generatorElectrical / 0.87) * 0.91
    : 0;
  const propulsion = Math.max(0, drive.motorPowerKw) + engineToWheel;
  const fullPower = drive.vehicleId === "aura_fe13_epower" ? 85 : 100;
  const chargeFraction = bounded(regenPower / 28, 0, 1);
  const driveFraction = bounded(propulsion / fullPower, 0, 1);
  const zone = regenPower > 0.15 ? "CHARGE"
    : driveFraction > 0.66 ? "POWER" : "ECO";
  const isHybrid = drive.batterySoc !== null;
  let energyFlow = "エンジン → 車輪";
  if (isHybrid) {
    if (regenPower > 0.15) energyFlow = "車輪 → 回生 → バッテリー";
    else if (drive.vehicleId === "aura_fe13_epower" && generatorElectrical > 0.1)
      energyFlow = "エンジン → 発電機 → モーター／電池";
    else if (drive.vehicleId === "prius_60_hev" && drive.combustionActive)
      energyFlow = "エンジン＋モーター → 車輪";
    else energyFlow = "バッテリー → モーター → 車輪";
  }
  const engineState = drive.enginePhase === "RUNNING" ? "エンジン稼働"
    : drive.enginePhase === "STARTING" ? "エンジン始動中"
    : drive.enginePhase === "STOPPING" ? "エンジン停止動作"
    : "エンジン停止";
  return {
    layout,
    speedKmh: Math.max(0, Math.round(bounded(drive.speedMps, 0, 200) * 3.6)),
    engineRpm: Math.round(bounded(drive.rpm, 0, 12000)),
    motorRpm: Math.round(bounded(Math.abs(drive.mg2Rpm), 0, 30000)),
    socPct: isHybrid ? Math.round(bounded(drive.batterySoc ?? 0, 0, 1)*100) : null,
    zone,
    chargeFraction,
    driveFraction,
    engineRunning: drive.combustionActive,
    engineState,
    batteryPowerKw: drive.batteryPowerKw,
    motorPowerKw: drive.motorPowerKw,
    generatorPowerKw: drive.generatorPowerKw,
    regenPowerKw: drive.regenPowerKw,
    energyFlow
  };
}
