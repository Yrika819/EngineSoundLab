/** Public design contracts. Values are simulation outputs, not gauge-needle values. */
export type PowertrainKind = "ICE" | "POWER_SPLIT_HEV" | "SERIES_HEV";
export type EngineState = "STOPPED" | "CRANKING" | "RUNNING" | "MOTORING" | "STOPPING";
export type AudioMode = "SYNTH" | "HYBRID";
export type EvidenceGrade = "official" | "measured" | "estimated" | "placeholder";

export interface VehiclePreset {
  schemaVersion: 1;
  id: string;
  manufacturer: string;
  model: string;
  modelYear: number;
  market: "JP";
  powertrain: {
    kind: PowertrainKind;
    controllerId: string;
    configurationId: string;
  };
  chassisId: string;
  engineId: string;
  batteryId?: string;
  motorIds: string[];
  audioProfileId: string;
  gaugeThemeId: string;
  evidenceId: string;
}

export interface DriverInput {
  /** Each normalized in the range [0,1]. */
  throttle: number;
  brake: number;
  driveMode: string;
}

export interface VehicleTelemetry {
  sequence: number;
  simulationTimeSec: number;
  speedMps: number;
  accelerationMps2: number;
  engineState: EngineState;
  engineRpm: number;
  engineTorqueNm: number;
  combustionActive: boolean;
  /** Normalized [0,1]. */
  engineLoad: number;
  /** Normalized [0,1]. */
  batterySoc: number;
  /** Positive = discharging battery. */
  batteryPowerKw: number;
  /** Positive = propulsion; negative = regen. */
  motorPowerKw: number;
  /** Positive = generated power. */
  generatorPowerKw: number;
  /** Nonnegative regen display quantity; do not double count. */
  regenPowerKw: number;
  throttle: number;
  brake: number;
  gearPosition: string;
  driveMode: string;
}

export interface EngineAudioFrame {
  timeSec: number;
  rpm: number;
  load: number;
  combustionActive: boolean;
  intakeIntensity: number;
  exhaustIntensity: number;
  motorRpm: number;
  motorLoad: number;
  vehicleSpeedMps: number;
}

export interface PowertrainController {
  readonly kind: PowertrainKind;
  reset(): void;
  update(input: DriverInput, timestepSeconds: number): VehicleTelemetry;
}

export interface AudioEngine {
  initialize(): Promise<void>;
  start(): Promise<void>;
  setMode(mode: AudioMode): void;
  setVehicle(profileId: string): Promise<void>;
  update(frame: EngineAudioFrame): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  dispose(): Promise<void>;
}

export type GaugePage = "OEM_STYLE" | "SPORT" | "ENGINEERING";
export interface GaugeTheme {
  id: string;
  manufacturer: string;
  pages: GaugePage[];
  render(telemetry: VehicleTelemetry, timestampMs: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
