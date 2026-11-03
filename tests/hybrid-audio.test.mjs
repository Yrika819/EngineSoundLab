import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineSynthCore } from "../apps/web/public/synth-core.js";
function energy({ motor = 0, motorRpm = 2000, combustion = 0, speed = 0 } = {}) {
 const engine=new EngineSynthCore(48000,123,"i3");
 let sum=0;
 for(let i=0;i<24000;i++){
  const v=engine.next(1800,0.7,0.7,speed,1,combustion,motor,motorRpm);
  assert.ok(Number.isFinite(v) && Math.abs(v)<=0.54);
  if(i>12000)sum+=v*v;
 }
 return Math.sqrt(sum/11999);
}
test("engine-off motion remains silent without motor or road noise",()=>{
 assert.ok(energy({motor:0,combustion:0,speed:0})<1e-5);
});
test("motor sound is audible even if combustion is switched off",()=>{
 const silent=energy({motor:0,combustion:0,speed:0});
 const motor=energy({motor:0.9,combustion:0,speed:0});
 assert.ok(motor>silent+0.003);
});
test("changing motor output changes sound energy without combustion",()=>{
 const low=energy({motor:0.15,combustion:0});
 const high=energy({motor:1,combustion:0});
 assert.ok(high>low*3);
});
