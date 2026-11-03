import { test } from "node:test";
import { strict as assert } from "node:assert";
import { makeDriveState, advanceDrive } from "../apps/web/src/powertrains";
import { makeGaugeSnapshot, resolveGaugeLayout } from "../apps/web/src/gauges";

test("auto gauge selection uses Prius, Aura and generic-specific layouts", () => {
  assert.equal(resolveGaugeLayout("prius_60_hev", "AUTO"), "PRIUS");
  assert.equal(resolveGaugeLayout("aura_fe13_epower", "AUTO"), "AURA_CLASSIC");
  assert.equal(resolveGaugeLayout("generic_i4", "AUTO"), "SPORT");
  assert.equal(resolveGaugeLayout("aura_fe13_epower", "AURA_ENHANCED"), "AURA_ENHANCED");
  assert.equal(resolveGaugeLayout("prius_60_hev", "AURA_ENHANCED"), "PRIUS");
  assert.equal(resolveGaugeLayout("aura_fe13_epower", "ENGINEERING"), "ENGINEERING");
  assert.equal(resolveGaugeLayout("prius_60_hev", "SPORT"), "SPORT");
});
test("Prius EV indication derives only from actual combustion state", () => {
  const state=makeDriveState("prius_60_hev");
  const view=makeGaugeSnapshot(state);
  assert.equal(view.engineRunning,false);
  assert.equal(view.engineState,"エンジン停止");
  assert.equal(view.socPct,63);
  assert.equal(view.zone,"ECO");
});
test("increasing motor traction power moves power gauge in the correct direction", () => {
  const state=makeDriveState("aura_fe13_epower");
  const low=makeGaugeSnapshot({...state,motorPowerKw:10});
  const high=makeGaugeSnapshot({...state,motorPowerKw:70});
  assert.ok(low.driveFraction<high.driveFraction);
  assert.equal(high.zone,"POWER");
  assert.equal(high.chargeFraction,0);
});
test("regeneration uses CHARGE sector and a negative-direction energy flow", () => {
  const state=makeDriveState("aura_fe13_epower");
  const view=makeGaugeSnapshot({...state,regenPowerKw:12,motorPowerKw:-15});
  assert.equal(view.zone,"CHARGE");
  assert.ok(view.chargeFraction>0);
  assert.match(view.energyFlow,/回生/);
});
test("Aura generation and Prius hybrid flow remain different", () => {
  const aura=makeDriveState("aura_fe13_epower");
  const prius=makeDriveState("prius_60_hev");
  const a=makeGaugeSnapshot({...aura,enginePhase:"RUNNING",combustionActive:true,generatorPowerKw:19});
  const p=makeGaugeSnapshot({...prius,enginePhase:"RUNNING",combustionActive:true,generatorPowerKw:4});
  assert.match(a.energyFlow,/発電機/);
  assert.match(p.energyFlow,/エンジン＋モーター/);
});
test("engineering values use the same immutable simulation telemetry",()=>{
 const s=advanceDrive(makeDriveState("aura_fe13_epower"),{throttle:.8,brake:0},.01);
 const g=makeGaugeSnapshot(s,"ENGINEERING");
 assert.equal(g.layout,"ENGINEERING");
 assert.equal(g.speedKmh,Math.round(s.speedMps*3.6));
 assert.equal(g.batteryPowerKw,s.batteryPowerKw);
 assert.equal(g.motorPowerKw,s.motorPowerKw);
 assert.equal(g.generatorPowerKw,s.generatorPowerKw);
 assert.equal(g.regenPowerKw,s.regenPowerKw);
});
test("display calculation is bounded and handles invalid numeric telemetry",()=>{
 const s=makeDriveState("prius_60_hev");
 const g=makeGaugeSnapshot({...s,speedMps:Infinity,rpm:NaN,batterySoc:-1,motorPowerKw:Infinity,regenPowerKw:100000});
 assert.equal(g.speedKmh,0);
 assert.equal(g.engineRpm,0);
 assert.equal(g.socPct,0);
 assert.equal(g.chargeFraction,1);
 assert.ok(g.driveFraction>=0 && g.driveFraction<=1);
});
