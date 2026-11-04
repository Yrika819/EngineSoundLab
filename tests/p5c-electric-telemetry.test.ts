import { test } from "node:test";
import { strict as assert } from "node:assert";
import { makeDriveState, advanceDrive } from "../apps/web/src/powertrains";
import { toAudioTelemetry } from "../apps/web/src/audio-telemetry";

test("P5-C: Prius MG1 starter and generator are separate electric modes",()=>{
 const base=makeDriveState("prius_60_hev");
 const startup=advanceDrive(base,{throttle:0.85,brake:0},0.01);
 const startAudio=toAudioTelemetry(startup);
 assert.equal(startup.engineOperation,"STARTING");
 assert.equal(startAudio.generatorAmplitude,0);
 assert.ok(startAudio.generatorMotoringAmplitude>0);
 assert.equal(startAudio.combustionGate,0);
 assert.equal(startAudio.electricProfile,1);
 const fuelled=toAudioTelemetry({
  ...startup,engineOperation:"RUNNING_FUELLED",combustionActive:true,
  generatorPowerKw:17,mg1Rpm:-2100
 });
 assert.ok(fuelled.generatorAmplitude>0);
 assert.equal(fuelled.generatorMotoringAmplitude,0);
 assert.equal(fuelled.generatorShaftRpm,2100);
});
test("P5-C: Aura EM47 drives regardless of its generating engine status",()=>{
 const aura=makeDriveState("aura_fe13_epower");
 const electric=toAudioTelemetry({
  ...aura,tractionMotorTorqueNm:160,motorPowerKw:20,mg2Rpm:3600,
  generatorPowerKw:0
 });
 assert.equal(electric.combustionGate,0);
 assert.ok(electric.motorTorqueNormalized>0);
 assert.ok(electric.motorAmplitude>0);
 assert.equal(electric.generatorAmplitude,0);
 const generator=toAudioTelemetry({
  ...aura,engineOperation:"RUNNING_FUELLED",combustionActive:true,
  generatorPowerKw:24,mg1Rpm:1900
 });
 assert.ok(generator.generatorAmplitude>0);
 assert.equal(generator.generatorMotoringAmplitude,0);
 assert.equal(generator.electricProfile,2);
});
test("P5-C: regenerative motor torque stays negative and distinct from output power",()=>{
 const state=makeDriveState("aura_fe13_epower");
 const view=toAudioTelemetry({
  ...state,tractionMotorTorqueNm:-180,motorPowerKw:-17,
  regenPowerKw:11,mg2Rpm:2400
 });
 assert.ok(view.motorTorqueNormalized<0);
 assert.ok(view.regenAmplitude>0);
 assert.ok(view.motorAmplitude>0);
 assert.equal(view.combustionGate,0);
 const forward=toAudioTelemetry({
  ...state,tractionMotorTorqueNm:180,motorPowerKw:17,
  regenPowerKw:0,mg2Rpm:2400
 });
 assert.ok(forward.motorTorqueNormalized>0);
 assert.equal(forward.regenAmplitude,0);
});
test("P5-C: torque-driven low-speed sound amplitude does not require high wheel power",()=>{
 const state=makeDriveState("prius_60_hev");
 const low=toAudioTelemetry({...state,
  motorPowerKw:0.07,tractionMotorTorqueNm:220,mg2Rpm:80
 });
 assert.ok(low.motorAmplitude>0.1);
 assert.ok(low.motorTorqueNormalized>0);
 const off=toAudioTelemetry(makeDriveState("generic_i4"));
 assert.equal(off.motorTorqueNormalized,0);
 assert.equal(off.generatorMotoringAmplitude,0);
});
test("P5-C: no false generation while the Aura engine spins without fuel",()=>{
 const base=makeDriveState("aura_fe13_epower");
 const state=toAudioTelemetry({...base,
  engineOperation:"SPINNING_UNFUELLED",rpm:1850,
  mg1Rpm:1850,engineMotoringElectricalKw:3.5,
  generatorPowerKw:0,combustionActive:false
 });
 assert.equal(state.generatorAmplitude,0);
 assert.ok(state.generatorMotoringAmplitude>0);
 assert.equal(state.combustionGate,0);
 assert.ok(state.generatorShaftRpm>0);
});
