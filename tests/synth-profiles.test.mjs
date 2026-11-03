import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineSynthCore, ENGINE_PROFILES } from "../apps/web/public/synth-core.js";

const RATE=48000;
test("I3, I4 and I6 have physically distinct 4-stroke firing cadence",()=>{
  for(const [id,expected] of [["i3",75],["i4",100],["i6",150]]){
    const synth=new EngineSynthCore(RATE,1234,id);
    // Ignore the initialization RPM ramp and count only the second full second.
    for(let i=0;i<RATE;i++)synth.next(3000,0.7,0.7,0,1,1);
    synth.firingEvents=0;
    for(let i=0;i<RATE;i++)synth.next(3000,0.7,0.7,0,1,1);
    assert.ok(Math.abs(synth.firingEvents-expected)<=1,`${id}: ${synth.firingEvents} vs ${expected}`);
    assert.equal(ENGINE_PROFILES[id].firingAngles.length,ENGINE_PROFILES[id].cylinders);
  }
});
test("profile sound waves are different at the same RPM and throttle",()=>{
 const snapshots={};
 for(const id of ["i3","i4","i6"]){
  const synth=new EngineSynthCore(RATE,77,id),samples=[];
  for(let i=0;i<4000;i++){
   const v=synth.next(2400,0.7,0.7,0,1,1);
   assert.ok(Number.isFinite(v)&&Math.abs(v)<=0.54);
   if(i>3500)samples.push(v);
  }
  snapshots[id]=samples.map(v=>v.toFixed(5)).join(",");
 }
 assert.notEqual(snapshots.i3,snapshots.i4);
 assert.notEqual(snapshots.i4,snapshots.i6);
 assert.notEqual(snapshots.i3,snapshots.i6);
});
test("switching live preserves crank phase and does not produce a hard impulse",()=>{
 const synth=new EngineSynthCore(RATE,7,"i4");
 let previous=0,maxJump=0;
 for(let i=0;i<12000;i++){
  if(i===5000){
   const beforeAngle=synth.crankAngle;
   synth.setProfile("i6");
   assert.equal(synth.crankAngle,beforeAngle);
  }
  if(i===8000)synth.setProfile("i3");
  const value=synth.next(2600,0.65,0.75,0,1,1);
  maxJump=Math.max(maxJump,Math.abs(value-previous));
  previous=value;
 }
 assert.equal(synth.profileId,"i3");
 assert.ok(maxJump<0.25,`unexpected level jump: ${maxJump}`);
});
test("invalid profile cannot corrupt an existing selection",()=>{
 const synth=new EngineSynthCore(RATE,10,"i4");
 assert.throws(()=>synth.setProfile("v12"),RangeError);
 assert.throws(()=>synth.setProfile("__proto__"),RangeError);
 assert.equal(synth.profileId,"i4");
 assert.throws(()=>new EngineSynthCore(RATE,10,"i99"),RangeError);
});
