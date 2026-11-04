import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  makeDriveState, advanceDrive, batteryPowerLimits, SOC_MIN, SOC_MAX,
  type DriveState, type VehicleId
} from "../apps/web/src/powertrains";
import { toAudioTelemetry } from "../apps/web/src/audio-telemetry";

const step = (state: DriveState, gas: number, brake = 0) =>
  advanceDrive(state, { throttle: gas, brake }, 0.01);

test("P5-A: battery power headroom reaches zero exactly at SOC bounds", () => {
  const bottom = batteryPowerLimits(SOC_MIN, 0.01);
  const top = batteryPowerLimits(SOC_MAX, 0.01);
  assert.equal(bottom.dischargeKw, 0);
  assert.equal(top.chargeKw, 0);
  assert.ok(bottom.chargeKw > 0);
  assert.ok(top.dischargeKw > 0);
  const nearBottom = batteryPowerLimits(SOC_MIN + 1e-7, 0.01);
  assert.ok(nearBottom.dischargeKw > 0 && nearBottom.dischargeKw < 55);
  assert.throws(() => batteryPowerLimits(0.5, 0), RangeError);
});

test("P5-A: at depleted battery, electric drive cannot spend missing battery energy", () => {
  let s = { ...makeDriveState("aura_fe13_epower"), batterySoc: SOC_MIN };
  const after = step(s, 1);
  assert.equal(after.motorPowerKw, 0);
  assert.equal(after.generatorPowerKw, 0);
  assert.equal(after.batteryPowerKw, 0);
  assert.equal(after.batterySoc, SOC_MIN);
  assert.equal(after.engineOperation, "STARTING");
  assert.equal(toAudioTelemetry(after).combustionGate, 0);
  // Once the generator runs, motor power is limited by generator + battery.
  for (let i = 0; i < 250; i++) s = step(s, 1);
  assert.equal(s.engineOperation, "RUNNING_FUELLED");
  assert.ok(s.generatorPowerKw > 0 && s.motorPowerKw >= 0);
  assert.ok(s.batterySoc! >= SOC_MIN);
});

test("P5-A: a full battery cannot silently accept excess recuperation", () => {
  const original = {
    ...makeDriveState("aura_fe13_epower"),
    batterySoc: SOC_MAX, speedMps: 20
  };
  const s = step(original, 0, 0.8);
  assert.ok(s.speedMps < original.speedMps);
  assert.ok(s.regenPowerKw >= 0);
  assert.ok(s.batteryPowerKw >= -1e-9);
  assert.ok(s.batterySoc! <= SOC_MAX);
  assert.equal(s.motorPowerKw <= 0, true);
});

test("P5-A: unfuelled engine rotation uses electrical power, not combustion or engine wheel drive", () => {
  const original = {
    ...makeDriveState("aura_fe13_epower"),
    batterySoc: 0.83, speedMps: 20
  };
  let s = original;
  for (let i=0; i<80; i++) s = step(s, 0, 0.7);
  assert.equal(s.engineOperation, "SPINNING_UNFUELLED");
  assert.equal(s.enginePhase, "RUNNING"); // legacy cockpit state
  assert.ok(s.rpm > 400);
  assert.equal(s.combustionActive, false);
  assert.equal(s.engineMechanicalKw, 0);
  assert.equal(s.generatorPowerKw, 0);
  assert.ok(s.engineMotoringElectricalKw > 0);
  const t = toAudioTelemetry(s);
  assert.equal(t.combustionGate, 0);
  assert.equal(t.engineRotating, true);
  assert.ok(t.engineRpm > 400);
  assert.equal(t.generatorAmplitude, 0);
  assert.ok(t.regenAmplitude > 0);
  assert.ok(t.engineMotoringElectricalKw > 0);
});

test("P5-A: spin-to-stop removes fuel combustion even during transients", () => {
  let s = {
    ...makeDriveState("aura_fe13_epower"),
    speedMps: 15, batterySoc: 0.82
  };
  s = step(s, 0, 0.8);
  assert.equal(s.engineOperation, "SPINNING_UNFUELLED");
  s = step(s, 0, 0);
  assert.equal(s.engineOperation, "STOPPING");
  assert.equal(s.combustionActive, false);
  assert.equal(toAudioTelemetry(s).combustionGate, 0);
});

test("P5-A: only fuelled state emits combustion telemetry", () => {
  for (const id of ["prius_60_hev", "aura_fe13_epower"] as VehicleId[]) {
    let s = makeDriveState(id);
    let t = toAudioTelemetry(s);
    assert.equal(t.combustionGate, 0);
    assert.equal(t.generatorAmplitude, 0);
    s = step(s, .9);
    assert.equal(s.engineOperation, "STARTING");
    assert.equal(toAudioTelemetry(s).combustionGate, 0);
    for (let i = 0; i < 120; i++) s = step(s, .9);
    assert.equal(s.engineOperation, "RUNNING_FUELLED");
    t = toAudioTelemetry(s);
    assert.equal(t.combustionGate, 1);
    assert.ok(t.engineRpm > 0);
  }
});

test("P5-A: two vehicles expose distinct traction/generator kinematics", () => {
  let aura = makeDriveState("aura_fe13_epower");
  let prius = makeDriveState("prius_60_hev");
  for (let i=0; i<400; i++) {
    aura = step(aura, 0.92);
    prius = step(prius, 0.92);
  }
  const a = toAudioTelemetry(aura);
  const p = toAudioTelemetry(prius);
  assert.equal(a.electricProfile, 2);
  assert.equal(p.electricProfile, 1);
  assert.ok(a.tractionShaftRpm > 0 && p.tractionShaftRpm > 0);
  assert.equal(a.generatorShaftRpm, Math.abs(aura.mg1Rpm));
  assert.equal(p.generatorShaftRpm, Math.abs(prius.mg1Rpm));
  assert.ok(Math.abs(aura.engineMechanicalKw - aura.generatorPowerKw / 0.87) < 1e-8);
  assert.ok(aura.tractionMotorTorqueNm > 0);
  assert.ok(prius.tractionMotorTorqueNm > 0);
});

test("P5-A: accounting equation and SOC derivative remain consistent in random drive cycles", () => {
  let seed = 0x61c4a2;
  const random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  for (const id of ["aura_fe13_epower", "prius_60_hev"] as VehicleId[]) {
    let s = makeDriveState(id);
    for (let i=0; i<5000; i++) {
      const before = s.batterySoc!;
      const throttle = random() * (i % 3 === 0 ? .25 : 1);
      const braking = random() * (i % 11 === 0 ? 1 : .2);
      const headroom = batteryPowerLimits(before, 0.01);
      s = step(s, throttle, braking);
      const motorElectric = s.motorPowerKw >= 0
        ? s.motorPowerKw / 0.9 : s.motorPowerKw * 0.78;
      // Auxiliary is 0.25 in a charged working vehicle; lower values are
      // permitted only if instantaneous available energy cannot power it.
      const auxiliary = s.batteryPowerKw - motorElectric -
        s.engineMotoringElectricalKw + s.generatorPowerKw;
      assert.ok(auxiliary >= -1e-7 && auxiliary <= 0.2500001);
      assert.ok(s.batteryPowerKw <= headroom.dischargeKw + 1e-8);
      assert.ok(s.batteryPowerKw >= -headroom.chargeKw - 1e-8);
      assert.ok(Math.abs((s.batterySoc! - before) +
        s.batteryPowerKw * 0.01 / (3600 * 1.3)) < 2e-10);
      assert.ok(s.batterySoc! >= SOC_MIN - 1e-10 && s.batterySoc! <= SOC_MAX + 1e-10);
      assert.ok(Number.isFinite(s.tractionMotorTorqueNm));
      assert.equal(s.combustionActive, s.engineOperation === "RUNNING_FUELLED");
      if (!s.combustionActive) {
        assert.equal(s.generatorPowerKw, 0);
        assert.equal(s.engineMechanicalKw, 0);
      }
    }
  }
});

test("P5-A: invalid audio numeric state is clamped and generic ICE has no false electric sound", () => {
  const generic = makeDriveState("generic_i4");
  const base = toAudioTelemetry(generic, NaN);
  assert.equal(base.electricProfile, 0);
  assert.equal(base.generatorAmplitude, 0);
  assert.equal(base.motorAmplitude, 0);
  assert.equal(base.batterySoc, null);
  assert.equal(base.throttle, 0);
  const invalid = toAudioTelemetry({
    ...makeDriveState("prius_60_hev"),
    rpm: Infinity, speedMps: -1,
    motorPowerKw: Infinity, generatorPowerKw: Infinity,
    mg1Rpm: NaN, mg2Rpm: NaN
  });
  assert.equal(invalid.engineRpm, 0);
  assert.equal(invalid.motorAmplitude, 0);
  assert.equal(invalid.generatorAmplitude, 0);
  assert.equal(invalid.tractionShaftRpm, 0);
  assert.equal(invalid.speedMps, 0);
});
