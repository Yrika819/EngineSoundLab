import { test } from "node:test";
import { strict as assert } from "node:assert";
import { makeDriveState, advanceDrive, type DriveState, type VehicleId } from "../apps/web/src/powertrains";

function simulate(id:VehicleId, throttle:number, seconds:number):DriveState {
 let s=makeDriveState(id);
 const steps=Math.floor(seconds/0.01);
 for(let i=0;i<steps;i++)s=advanceDrive(s,{throttle,brake:0},0.01);
 return s;
}
test("Prius power split can start in EV mode with engine off",()=>{
 const s=simulate("prius_60_hev",0.12,3);
 assert.ok(s.speedMps>0.4);
 assert.equal(s.enginePhase,"STOPPED");
 assert.equal(s.combustionActive,false);
 assert.ok(s.motorPowerKw>0);
 assert.equal(s.generatorPowerKw,0);
});
test("Aura e-POWER uses motor drive without engine starting at gentle initial load",()=>{
 const s=simulate("aura_fe13_epower",0.15,2);
 assert.ok(s.speedMps>0);
 assert.equal(s.enginePhase,"STOPPED");
 assert.equal(s.combustionActive,false);
 assert.ok(s.motorPowerKw>0);
 assert.equal(s.generatorPowerKw,0);
});
test("Aura starts a generator at high demand but engine is mechanically disconnected",()=>{
 const s=simulate("aura_fe13_epower",0.92,5);
 assert.ok(s.speedMps>3);
 assert.equal(s.enginePhase,"RUNNING");
 assert.equal(s.combustionActive,true);
 assert.ok(s.generatorPowerKw>0);
 assert.ok(s.motorPowerKw>0);
 assert.ok(Math.abs(s.engineMechanicalKw-s.generatorPowerKw/0.87)<1e-6);
 assert.ok(s.batterySoc!==null && s.batterySoc>=0.16 && s.batterySoc<=0.86);
});
test("Aura generation RPM depends on energy demand, not wheel RPM",()=>{
 let s=simulate("aura_fe13_epower",0.95,5);
 const a=advanceDrive({...s,speedMps:6},{throttle:0.85,brake:0},0.01);
 const b=advanceDrive({...s,speedMps:24},{throttle:0.85,brake:0},0.01);
 assert.equal(a.rpm,b.rpm);
 assert.equal(a.generatorPowerKw,b.generatorPowerKw);
 assert.notEqual(a.speedMps,b.speedMps);
});
test("Prius enforces the conceptual planetary gear speed relationship",()=>{
 const s=simulate("prius_60_hev",0.9,5);
 assert.equal(s.enginePhase,"RUNNING");
 assert.ok(s.rpm>850);
 const wheelRpm=s.speedMps/(2*Math.PI*0.31)*60;
 const ringRpm=wheelRpm*3;
 const lhs=(30+78)*s.rpm;
 const rhs=30*s.mg1Rpm+78*ringRpm;
 assert.ok(Math.abs(lhs-rhs)<1e-7);
 assert.ok(s.engineMechanicalKw>0);
});
test("braking recovers energy without double-counting the braking force",()=>{
 let s=simulate("aura_fe13_epower",0.9,4.5);
 const before=s.speedMps;
 s=advanceDrive(s,{throttle:0,brake:0.7},0.01);
 assert.ok(s.speedMps<before);
 assert.ok(s.regenPowerKw>0);
 assert.ok(s.motorPowerKw<0);
});
test("battery kW sign convention and SOC integration are internally consistent",()=>{
 let s=simulate("aura_fe13_epower",0.4,2.0);
 const soc=s.batterySoc!;
 const next=advanceDrive(s,{throttle:0.4,brake:0},0.01);
 const electricMotorKw=next.motorPowerKw>=0?next.motorPowerKw/0.9:next.motorPowerKw*0.78;
 const expectedBattery=electricMotorKw+0.25-next.generatorPowerKw;
 assert.ok(Math.abs(next.batteryPowerKw-expectedBattery)<1e-10);
 assert.ok(Math.abs(next.batterySoc!-(soc-next.batteryPowerKw*0.01/(3600*1.3)))<1e-8);
});
test("hybrid state remains finite, SOC bounded over changing demand",()=>{
 for(const id of ["prius_60_hev","aura_fe13_epower"] as const){
  let s=makeDriveState(id);
  for(let i=0;i<5000;i++){
   const throttle=i%850<550?0.92:0.05;
   const brake=i%850>620?0.35:0;
   s=advanceDrive(s,{throttle,brake},0.01);
   for(const n of [s.timeSec,s.speedMps,s.rpm,s.load,s.accelerationMps2,s.batteryPowerKw,
      s.generatorPowerKw,s.motorPowerKw,s.mg1Rpm,s.mg2Rpm]){
    assert.ok(Number.isFinite(n),id+" emitted NaN/Infinity");
   }
   assert.ok(s.batterySoc!==null && s.batterySoc>=0.16 && s.batterySoc<=0.86);
   assert.ok(s.speedMps>=0 && s.rpm>=0);
   if(!s.combustionActive)assert.equal(s.engineMechanicalKw,0);
  }
 }
});
test("generic ICE remains supported and no false battery state is displayed",()=>{
 let s=makeDriveState("generic_i4");
 for(let i=0;i<200;i++)s=advanceDrive(s,{throttle:0.65,brake:0},0.01);
 assert.ok(s.speedMps>0);
 assert.equal(s.batterySoc,null);
 assert.equal(s.combustionActive,true);
});
test("nonphysical timesteps are rejected",()=>{
 for(const id of ["prius_60_hev","aura_fe13_epower","generic_i4"] as const){
  assert.throws(()=>advanceDrive(makeDriveState(id),{throttle:1,brake:0},0),RangeError);
  assert.throws(()=>advanceDrive(makeDriveState(id),{throttle:1,brake:0},1),RangeError);
 }
});
