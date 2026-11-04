import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineSynthCore } from "../apps/web/public/synth-core.js";
import { ICE_TONE_PROFILES, VehicleIceAcoustics } from "../apps/web/public/ice-acoustics.js";

function render({
  rate=48000, rpm=2900, load=0.72, throttle=0.72,
  profile=1, cylinders="i4", combustion=1, motoring=0,
  seconds=0.6, seed=0x17453
}={}) {
  const core=new EngineSynthCore(rate,seed,cylinders);
  const data=new Float32Array(Math.floor(seconds*rate));
  let peak=0,maxJump=0,accumulator=0,n=0,prev=0;
  for(let i=0;i<data.length;i++) {
    const value=core.next(rpm,load,throttle,0,1,combustion,
      0,0,0,0,0,0,profile,motoring);
    assert.ok(Number.isFinite(value),"DSP emitted NaN/Inf");
    data[i]=value;
    peak=Math.max(peak,Math.abs(value));
    maxJump=Math.max(maxJump,Math.abs(value-prev));
    prev=value;
    if(i>data.length*0.60){accumulator+=value*value;n++;}
  }
  return {data,peak,maxJump,rms:Math.sqrt(accumulator/Math.max(1,n)),
    fires:core.firingEvents};
}

test("P5-B: vehicle-specific parameters are independently authored and labelled estimates",()=>{
  assert.ok(ICE_TONE_PROFILES.PRIUS.exhaustHz !== ICE_TONE_PROFILES.AURA.exhaustHz);
  assert.ok(ICE_TONE_PROFILES.PRIUS.intakeGain !== ICE_TONE_PROFILES.AURA.intakeGain);
  assert.equal(ICE_TONE_PROFILES.PRIUS.crankOrder,2);
  assert.equal(ICE_TONE_PROFILES.AURA.crankOrder,1.5);
  assert.match(ICE_TONE_PROFILES.PRIUS.label,/estimated/);
  assert.match(ICE_TONE_PROFILES.AURA.label,/estimated/);
});

test("P5-B: Prius I4 and Aura I3 fire at real four-stroke event cadence",()=>{
  const prius=render({rpm:3000,profile:1,cylinders:"i4",seconds:1.5});
  const aura=render({rpm:3000,profile:2,cylinders:"i3",seconds:1.5});
  // Initial 25 ms RPM smoothing from 850 RPM produces slightly fewer firings.
  assert.ok(Math.abs(prius.fires-150)<=4, "I4 fires="+prius.fires);
  assert.ok(Math.abs(aura.fires-112.5)<=4, "I3 fires="+aura.fires);
});

test("P5-B: different ICE geometries produce distinct bounded timbres",()=>{
  const generic=render({rpm:2600,profile:0,cylinders:"i4"});
  const prius=render({rpm:2600,profile:1,cylinders:"i4"});
  const aura=render({rpm:2600,profile:2,cylinders:"i3"});
  for(const voice of [generic,prius,aura]){
    assert.ok(voice.rms>0.0015, "unexpected silent combustion");
    assert.ok(voice.peak<0.55, "voice exceeded output limiter");
  }
  assert.notDeepEqual(prius.data,generic.data);
  assert.notDeepEqual(prius.data,aura.data);
  assert.notDeepEqual(aura.data,generic.data);
});

test("P5-B: engine load shapes the same car's sound, not only its pitch",()=>{
  for(const [id,cylinders] of [[1,"i4"],[2,"i3"]]){
    const low=render({rpm:2900,load:0.05,throttle:0.05,profile:id,cylinders});
    const high=render({rpm:2900,load:0.98,throttle:0.98,profile:id,cylinders});
    assert.ok(high.rms>low.rms*1.10,
      "profile "+id+" load insensitive: "+low.rms+" vs "+high.rms);
    assert.equal(high.fires,low.fires,"load must not fake ignition timing");
  }
});

test("P5-B: an unfuelled rotating engine plays motoring but ZERO combustion",()=>{
  const stopped=render({rpm:2100,profile:2,cylinders:"i3",combustion:0,motoring:0});
  const unfuelled=render({rpm:2100,profile:2,cylinders:"i3",combustion:0,motoring:0.9});
  const notRotating=render({rpm:0,profile:2,cylinders:"i3",combustion:0,motoring:0.9,seconds:1.5});
  assert.ok(stopped.rms<0.00005, "false engine sound at combustion off");
  assert.ok(unfuelled.rms>stopped.rms+0.0015, "no motoring voice");
  assert.equal(stopped.fires,unfuelled.fires,
    "engine crank geometry must not be fabricated by motoring");
  assert.ok(notRotating.rms<0.00005, "motoring voice at zero shaft speed");
});

test("P5-B: transients at firing/profile and motoring gates do not click hard",()=>{
  const core=new EngineSynthCore(48000,0x333,"i4");
  let maxJump=0,last=0;
  for(let i=0;i<70000;i++) {
    const mode=i<14000?1:i<38000?2:i<57000?1:0;
    const fire=i<14000?1:i<38000?0:i<57000?1:0;
    const rpm=i<38000?2400:i<57000?3400:700;
    const motoring=fire?0:0.8;
    if(i===14000)core.setProfile("i3");
    if(i===38000)core.setProfile("i4");
    const v=core.next(rpm,.72,.6,0,1,fire,0,0,0,0,0,0,mode,motoring);
    assert.ok(Number.isFinite(v));
    maxJump=Math.max(maxJump,Math.abs(v-last));
    assert.ok(Math.abs(v)<=0.54);
    last=v;
  }
  assert.ok(maxJump<0.22,"abrupt click: "+maxJump);
});

test("P5-B: 44.1/48/96 kHz sample rates render stable brand timbres",()=>{
  for(const rate of [44100,48000,96000]){
    const prius=render({rate,profile:1,cylinders:"i4",seconds:0.15});
    const aura=render({rate,profile:2,cylinders:"i3",seconds:0.15});
    assert.ok(prius.rms>0.0005 && aura.rms>0.0005);
    assert.ok(prius.peak<0.55 && aura.peak<0.55);
  }
});

test("P5-B: deterministic offline snapshots are repeatable",()=>{
  const a=render({seconds:0.2,seed:142,profile:2,cylinders:"i3"});
  const b=render({seconds:0.2,seed:142,profile:2,cylinders:"i3"});
  assert.deepEqual(a.data,b.data);
});

test("P5-B: invalid data and sample rates cannot destabilize timbre DSP",()=>{
  assert.throws(()=>new VehicleIceAcoustics(0),RangeError);
  const core=new EngineSynthCore(48000,21,"i4");
  for(const bad of [NaN,Infinity,-Infinity,-1e12,1e12]){
    for(let i=0;i<512;i++){
      const v=core.next(bad,bad,bad,bad,bad,bad,0,0,0,0,0,0,bad,bad);
      assert.ok(Number.isFinite(v)&&Math.abs(v)<=0.54);
    }
  }
});
