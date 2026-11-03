import { test } from "node:test";
import assert from "node:assert/strict";
import { pedalOpeningFromPosition } from "../apps/web/src/pedal";

test("pedal uses absolute touch height: top full, bottom zero, center half",()=>{
 assert.equal(pedalOpeningFromPosition(100,100,200),1);
 assert.equal(pedalOpeningFromPosition(200,100,200),0.5);
 assert.equal(pedalOpeningFromPosition(300,100,200),0);
});
test("25, 50 and 75 percent are easy to target in five-percent steps",()=>{
 const top=50,height=240,inset=16,travel=height-2*inset;
 for(const fraction of [0.25,0.5,0.75]){
  const y=top+height-inset-travel*fraction;
  assert.equal(pedalOpeningFromPosition(y,top,height),fraction);
 }
});
test("out-of-bounds dragging clamps and invalid geometry defaults to released",()=>{
 assert.equal(pedalOpeningFromPosition(-1000,100,200),1);
 assert.equal(pedalOpeningFromPosition(1000,100,200),0);
 assert.equal(pedalOpeningFromPosition(10,10,0),0);
 assert.equal(pedalOpeningFromPosition(NaN,10,100),0);
 assert.equal(pedalOpeningFromPosition(10,NaN,100),0);
 assert.equal(pedalOpeningFromPosition(10,10,Infinity),0);
});
test("pointer movement gives monotonically increasing opening from bottom to top",()=>{
 let previous=0;
 for(let y=315;y>=75;y-=3){
  const value=pedalOpeningFromPosition(y,95,200);
  assert.ok(value>=previous, `y=${y}: ${value} < ${previous}`);
  previous=value;
 }
});
