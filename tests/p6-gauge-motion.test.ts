import { test } from "node:test";
import { strict as assert } from "node:assert";
import { GaugeSmoother } from "../apps/web/src/gauge-motion";
import { gaugeEnergyMode, makeGaugeSnapshot } from "../apps/web/src/gauges";
import { makeDriveState } from "../apps/web/src/powertrains";

test("P6.3 smoothing snaps first sample and keeps exact target independent of displayed value",()=>{
  const v=new GaugeSmoother(145,.03);
  assert.equal(v.settled,false);
  v.setTarget(-116);
  assert.equal(v.value,-116);
  assert.equal(v.settled,true);
  v.setTarget(116);
  assert.equal(v.value,-116);
  assert.equal(v.target,116);
  v.step(16.67);
  assert.ok(v.value>-116 && v.value<116);
  assert.equal(v.target,116);
});
test("P6.3 first-order gauge update is framerate independent",()=>{
  const simulate=(hz:number)=>{
    const v=new GaugeSmoother(135,.0000001);
    v.setTarget(0);
    v.setTarget(100);
    for(let n=0;n<hz;n++) v.step(1000/hz);
    return v.value;
  };
  // 60 Hz/30 Hz/120 Hz must have essentially equal traveled distance
  const r30=simulate(30),r60=simulate(60),r120=simulate(120);
  assert.ok(Math.abs(r30-r60)<.001);
  assert.ok(Math.abs(r60-r120)<.001);
  assert.ok(r30>99.90 && r30<=100);
});
test("P6.3 rapid acceleration and regeneration changes cannot overshoot",()=>{
  const v=new GaugeSmoother(165,.002);
  v.setTarget(-116);
  v.setTarget(132);
  for(let i=0;i<8;i++){
    const old=v.value;
    v.step(16.7);
    assert.ok(v.value>=old);
    assert.ok(v.value<=132);
  }
  v.setTarget(-132);
  for(let i=0;i<40;i++){
    const old=v.value;
    v.step(16.7);
    assert.ok(v.value<=old);
    assert.ok(v.value>=-132);
  }
  assert.ok(v.value < -125);
});
test("P6.3 invalid frame deltas or numeric sensor glitches never yield NaN",()=>{
  const v=new GaugeSmoother(170,.001);
  v.setTarget(18);
  v.setTarget(60);
  for(const dt of [-100,NaN,Infinity,-Infinity,1e10,0,16.7]){
    v.step(dt);
    assert.ok(Number.isFinite(v.value));
  }
  const before=v.target;
  for(const bad of [NaN,Infinity,-Infinity])v.setTarget(bad);
  assert.equal(v.target,before);
  v.snap();
  assert.equal(v.value,before);
  v.reset();
  assert.equal(v.settled,false);
  v.setTarget(5);
  assert.equal(v.value,5);
  assert.throws(()=>new GaugeSmoother(0),RangeError);
  assert.throws(()=>new GaugeSmoother(100,0),RangeError);
});
test("P6.3 Prius power-split combustion stays HYBRID, not Aura series generation",()=>{
  const prius=makeDriveState("prius_60_hev");
  const state=makeGaugeSnapshot({...prius,
    combustionActive:true,rpm:2800,generatorPowerKw:17,regenPowerKw:0,
    motorPowerKw:22,engineMechanicalKw:50});
  assert.equal(gaugeEnergyMode(state,"prius_60_hev"),"HYBRID");
  assert.match(state.energyFlow,/エンジン＋モーター/);
  assert.notEqual(gaugeEnergyMode(state,"prius_60_hev"),"GENERATION");
});
test("P6.3 Aura series e-POWER only shows generator flow with genuine generating power",()=>{
  const aura=makeDriveState("aura_fe13_epower");
  const state={...aura,combustionActive:true,rpm:2600,regenPowerKw:0,motorPowerKw:23};
  assert.equal(gaugeEnergyMode(makeGaugeSnapshot({
    ...state,generatorPowerKw:12
  }),"aura_fe13_epower"),"GENERATION");
  assert.equal(gaugeEnergyMode(makeGaugeSnapshot({
    ...state,generatorPowerKw:0
  }),"aura_fe13_epower"),"ENGINE_ON");
});
test("P6.3 regen has priority over generator, even while engine remains fuelled",()=>{
  for(const id of ["prius_60_hev","aura_fe13_epower"] as const){
    const s=makeDriveState(id);
    const g=makeGaugeSnapshot({...s,
      combustionActive:true,rpm:2800,regenPowerKw:16,
      motorPowerKw:-18,generatorPowerKw:13});
    assert.equal(gaugeEnergyMode(g,id),"REGEN");
    assert.equal(g.zone,"CHARGE");
  }
});
test("P6.3 no combustion never produces a false generating or hybrid mode",()=>{
  for(const id of ["prius_60_hev","aura_fe13_epower"] as const){
    const s=makeDriveState(id);
    const ev=makeGaugeSnapshot({...s,combustionActive:false,
      rpm:0,generatorPowerKw:0,regenPowerKw:0,motorPowerKw:10});
    assert.equal(gaugeEnergyMode(ev,id),"EV");
    const spinning=makeGaugeSnapshot({...s,combustionActive:false,
      rpm:750,generatorPowerKw:0,regenPowerKw:0});
    assert.equal(gaugeEnergyMode(spinning,id),"SPINNING");
  }
});
