import { test } from "node:test";
import { strict as assert } from "node:assert";
import { initialState, step, IDLE_RPM, REDLINE_RPM } from "../apps/web/src/physics";

test("accelerator drives generic car from rest",()=>{
 let s=initialState();
 for(let i=0;i<400;i++)s=step(s,{throttle:0.85,brake:0},0.01);
 assert.ok(s.speedMps>4);
 assert.ok(s.rpm>IDLE_RPM && s.rpm<=REDLINE_RPM);
 assert.ok(s.gear>=1&&s.gear<=5);
});
test("braking reduces speed without moving backwards",()=>{
 let s=initialState();
 for(let i=0;i<600;i++)s=step(s,{throttle:1,brake:0},0.01);
 const before=s.speedMps;
 for(let i=0;i<450;i++)s=step(s,{throttle:0,brake:1},0.01);
 assert.ok(s.speedMps<before);
 assert.ok(s.speedMps>=0);
});
test("fixed-step model is deterministic with finite outputs",()=>{
 const run=()=>{
  let s=initialState();
  for(let i=0;i<2000;i++){
   s=step(s,{throttle:i%400<250?0.7:0.1,brake:i%700>600?0.25:0},0.01);
   for(const n of [s.timeSec,s.speedMps,s.rpm,s.load,s.accelerationMps2])assert.ok(Number.isFinite(n));
  }
  return s;
 };
 assert.deepEqual(run(),run());
});
test("invalid physics timestep is rejected",()=>{
 assert.throws(()=>step(initialState(),{throttle:1,brake:0},0),RangeError);
 assert.throws(()=>step(initialState(),{throttle:1,brake:0},0.15),RangeError);
});
