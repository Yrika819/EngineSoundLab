import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineSynthCore } from "../apps/web/public/synth-core.js";
import { CabinSoundstage } from "../apps/web/public/cabin-soundstage.js";

const RATE = 48000;
function renderScenario({
  id=1, focus=0, combustion=1, throttle=0.65, load=0.65,
  speed=12, seconds=1, motorAmp=0.60, genAmp,
  engineRpm=2800
}={}) {
  const prius=id===1;
  const core=new EngineSynthCore(RATE,9716,prius?"i4":"i3");
  const generatorLevel=genAmp??(prius?0.30:0.55);
  const motorRpm=prius?3800:5200;
  const genRpm=prius?3900:2800;
  const n=Math.floor(RATE*seconds), tail=Math.floor(n/2);
  let ice=0,traction=0,generator=0,noise=0,output=0,peak=0,jump=0,prev=0;
  for(let i=0;i<n;i++){
    const value=core.next(engineRpm,load,throttle,speed,1,combustion,
      motorAmp,motorRpm,0,generatorLevel,genRpm,id,id,0,0.6,0,
      0,0.35,focus);
    assert.ok(Number.isFinite(value));
    peak=Math.max(peak,Math.abs(value));
    jump=Math.max(jump,Math.abs(value-prev));
    prev=value;
    if(i>tail){
      ice+=core.soundstage.lastEngine**2;
      traction+=core.soundstage.lastTraction**2;
      generator+=core.soundstage.lastGenerator**2;
      noise+=core.soundstage.lastTyre**2+core.soundstage.lastWind**2;
      output+=value*value;
    }
  }
  const rms=x=>Math.sqrt(x/Math.max(1,n-tail));
  return {
    ice:rms(ice),traction:rms(traction),generator:rms(generator),
    road:rms(noise),output:rms(output),peak,jump,
    electricToIce:(rms(traction)+rms(generator))/Math.max(1e-9,rms(ice)),
    core
  };
}
test("P5-D.1: fuelled Prius still exposes MG2 and MG1 behind the ICE",()=>{
  const b=renderScenario({id:1});
  assert.ok(b.ice>0.04,"combustion became silent");
  assert.ok(b.traction>0.035,"MG2 remains masked");
  assert.ok(b.generator>0.009,"MG1 generation remains masked");
  assert.ok(b.electricToIce>0.22&&b.electricToIce<1.5,
    `unbalanced Prius ${b.electricToIce}`);
  assert.ok(b.peak<0.55);
});
test("P5-D.1: Aura electric traction remains prominent during ICE generation",()=>{
  const a=renderScenario({id:2});
  assert.ok(a.ice>0.035);
  assert.ok(a.traction>0.045,"Aura electric drive is masked");
  assert.ok(a.generator>0.02,"Aura generator voice is masked");
  assert.ok(a.electricToIce>0.38&&a.electricToIce<1.7,
    `unbalanced Aura ${a.electricToIce}`);
  assert.ok(a.peak<0.55);
});
test("P5-D.1: strong electrical focus changes acoustics but not running ICE state",()=>{
  for(const id of [1,2]){
    const normal=renderScenario({id,focus:0});
    const electrical=renderScenario({id,focus:1});
    const engine=renderScenario({id,focus:-1});
    assert.ok(electrical.traction>normal.traction*1.35);
    assert.ok(electrical.generator>normal.generator*1.3);
    assert.ok(electrical.ice<normal.ice*0.90);
    assert.ok(engine.ice>normal.ice*1.15);
    assert.ok(engine.traction<normal.traction*0.90);
    assert.ok(electrical.electricToIce>normal.electricToIce*1.65);
    assert.ok(engine.electricToIce<normal.electricToIce*0.80);
    assert.equal(electrical.core.firingEvents,normal.core.firingEvents);
  }
});
test("P5-D.1: EV-only drivetrain never gets artificial combustion or generator audio",()=>{
  for(const id of [1,2]){
    const s=renderScenario({id,combustion:0,genAmp:0,focus:1});
    assert.ok(s.ice<1e-8,`false ignition output ${s.ice}`);
    assert.ok(s.generator<1e-8,`false generator output ${s.generator}`);
    assert.ok(s.traction>0.05,`weak EV traction ${s.traction}`);
    assert.ok(s.road>0);
  }
});
test("P5-D.1: engine load must still increase acoustic power",()=>{
  for(const id of [1,2]){
    const low=renderScenario({id,load:0.05,throttle:0.05,motorAmp:0,genAmp:0});
    const high=renderScenario({id,load:0.98,throttle:0.98,motorAmp:0,genAmp:0});
    assert.ok(high.output>low.output*1.15,`ICE load response lost for ${id}`);
  }
});
test("P5-D.1: mix selector is ignored for generic ICE",()=>{
  const render=(focus)=>{
    const core=new EngineSynthCore(RATE,82,"i4");
    let sum=0;
    for(let i=0;i<6000;i++){
      const v=core.next(2400,.65,.5,8,1,1,0,0,0,0,0,0,0,0,0,0,
        0,0.35,focus);
      sum+=v*v;
    }
    return sum;
  };
  assert.equal(render(0),render(1));
  assert.equal(render(0),render(-1));
});
test("P5-D.1: focus switch in flight remains smooth without sample spikes",()=>{
  for(const id of [1,2]){
    const core=new EngineSynthCore(RATE,0x58,id===1?"i4":"i3");
    let previous=0,peak=0,maxJump=0;
    for(let i=0;i<RATE;i++){
      const focus=i<14000?0:i<28000?1:i<40000?-1:0;
      const x=core.next(2700,.65,.7,18,1,1,
        .8,id===1?4100:5200,0.2,.5,2500,id,id,
        0,.6,0,0,.35,focus);
      assert.ok(Number.isFinite(x));
      peak=Math.max(peak,Math.abs(x));
      maxJump=Math.max(maxJump,Math.abs(x-previous));
      previous=x;
    }
    assert.ok(peak<0.55);
    assert.ok(maxJump<0.23,`click-sized switch jump ${maxJump}`);
  }
});
test("P5-D.1: invalid focus is clamped and stage avoids nonfinite output",()=>{
  const s=new CabinSoundstage(RATE);
  for(const focus of [NaN,Infinity,-Infinity,-999,999]){
    for(let i=0;i<1000;i++){
      const v=s.next(.08,.03,.10,.05,10,1,0,.35,focus);
      assert.ok(Number.isFinite(v));
    }
  }
});
