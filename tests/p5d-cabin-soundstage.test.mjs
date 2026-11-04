import { test } from "node:test";
import assert from "node:assert/strict";
import { CabinSoundstage, SOUNDSTAGE_PRESETS } from "../apps/web/public/cabin-soundstage.js";
import { EngineSynthCore } from "../apps/web/public/synth-core.js";

function render({
  rate=48000, seconds=0.40, engine=0, motoring=0,
  traction=0, generator=0, speed=0, profile=1,
  listener=0, surface=0.35
}={}) {
  const dsp=new CabinSoundstage(rate,0x5e6a7f);
  let peak=0, jump=0, previous=0;
  let power=0, tyrePower=0, windPower=0, enginePower=0, generatorPower=0, samples=0;
  for(let i=0;i<Math.floor(rate*seconds);i++){
    const v=dsp.next(engine,motoring,traction,generator,speed,
      profile,listener,surface);
    assert.ok(Number.isFinite(v));
    assert.ok(Number.isFinite(dsp.lastMaskAmount));
    peak=Math.max(peak,Math.abs(v));
    jump=Math.max(jump,Math.abs(v-previous));
    previous=v;
    if(i>rate*seconds*0.60){
      power+=v*v;
      tyrePower+=dsp.lastTyre*dsp.lastTyre;
      windPower+=dsp.lastWind*dsp.lastWind;
      enginePower+=dsp.lastEngine*dsp.lastEngine;
      generatorPower+=dsp.lastGenerator*dsp.lastGenerator;
      samples++;
    }
  }
  return {
    rms:Math.sqrt(power/samples),tyreRms:Math.sqrt(tyrePower/samples),
    windRms:Math.sqrt(windPower/samples),
    engineRms:Math.sqrt(enginePower/samples),
    generatorRms:Math.sqrt(generatorPower/samples),
    peak,jump,dsp
  };
}
test("P5-D: stationary silent car emits no tyre, wind or powertrain sound",()=>{
  const x=render({speed:0,engine:0,traction:0,generator:0});
  assert.ok(x.peak===0);
  for(const key of ["lastEngine","lastMotoring","lastTraction",
    "lastGenerator","lastTyre","lastWind"])
    assert.ok(x.dsp[key]===0,key);
});
test("P5-D: tyre and wind grow with vehicle speed, not combustion",()=>{
  const stop=render({speed:0});
  const crawl=render({speed:4});
  const cruise=render({speed:26});
  assert.ok(stop.rms===0);
  assert.ok(crawl.tyreRms>0.00005);
  assert.ok(cruise.tyreRms>crawl.tyreRms*2,
    `tyre: ${crawl.tyreRms} -> ${cruise.tyreRms}`);
  assert.ok(cruise.windRms>crawl.windRms+0.001,
    `wind: ${crawl.windRms} -> ${cruise.windRms}`);
  assert.ok(cruise.rms>crawl.rms);
});
test("P5-D: coarse pavement increases tyre texture but not powertrain phase",()=>{
  const smooth=render({speed:22,surface:0,engine:0.08});
  const rough=render({speed:22,surface:1,engine:0.08});
  assert.ok(rough.tyreRms>smooth.tyreRms*1.4);
  assert.ok(Math.abs(rough.engineRms-smooth.engineRms)<1e-10,
    "road selection should not change isolated ICE source");
  assert.ok(Math.abs(rough.windRms-smooth.windRms)<1e-10,
    "road surface is not a fake wind-speed control");
});
test("P5-D: cabin shields engine/generator more than open engine-bay preview",()=>{
  const cabin=render({engine:0.10,generator:0.07,profile:2,listener:0});
  const bay=render({engine:0.10,generator:0.07,profile:2,listener:1});
  assert.ok(bay.engineRms>cabin.engineRms*1.20,
    `engine ${cabin.engineRms}->${bay.engineRms}`);
  assert.ok(bay.generatorRms>cabin.generatorRms*1.3,
    `generator ${cabin.generatorRms}->${bay.generatorRms}`);
});
test("P5-D: cabin and bay perspectives attenuate the independent road/wind buses",()=>{
  const cabin=render({speed:30,listener:0});
  const bay=render({speed:30,listener:1});
  assert.ok(cabin.tyreRms>bay.tyreRms*1.7);
  assert.ok(cabin.windRms>bay.windRms*2);
});
test("P5-D: model-specific estimated cabin mixes remain distinct",()=>{
  const prius=render({engine:0.09,generator:0.08,traction:0.12,profile:1});
  const aura=render({engine:0.09,generator:0.08,traction:0.12,profile:2});
  assert.notEqual(prius.rms,aura.rms);
  assert.ok(SOUNDSTAGE_PRESETS.PRIUS.engineCutoffHz !==
    SOUNDSTAGE_PRESETS.AURA.engineCutoffHz);
  assert.ok(SOUNDSTAGE_PRESETS.PRIUS.generatorGain !==
    SOUNDSTAGE_PRESETS.AURA.generatorGain);
});
test("P5-D: all source lanes are independent and only the requested ones sound",()=>{
  const generator=render({generator:0.1,speed:0});
  assert.ok(generator.generatorRms>0.005);
  assert.ok(generator.dsp.lastEngine===0);
  assert.ok(generator.dsp.lastTraction===0);
  assert.ok(generator.dsp.lastTyre===0);
  const traction=render({traction:0.1,speed:0});
  assert.ok(traction.rms>0.01);
  assert.ok(traction.dsp.lastGenerator===0);
});
test("P5-D: live model, road and listening-position switch is continuous",()=>{
  const dsp=new CabinSoundstage(48000,0x82341);
  let last=0,peak=0,jump=0;
  for(let i=0;i<48000;i++){
    const model=Math.floor(i/8000)%3;
    const mode=Math.floor(i/9000)%2;
    const rough=Math.floor(i/12000)%2;
    const sample=dsp.next(0.08,0.04,0.1,0.07,
      10+(i%4000)/300,model,mode,rough);
    assert.ok(Number.isFinite(sample));
    jump=Math.max(jump,Math.abs(sample-last));
    peak=Math.max(peak,Math.abs(sample));
    last=sample;
  }
  assert.ok(jump<0.14,`click-sized jump: ${jump}`);
  assert.ok(peak<0.40,`stage overflow: ${peak}`);
});
test("P5-D: 8/44.1/48/96kHz render is finite and bounded",()=>{
  for(const rate of [8000,44100,48000,96000]){
    const x=render({rate,seconds:0.16,engine:0.10,motoring:0.05,
      traction:0.15,generator:0.07,speed:29,listener:1,profile:2,surface:1});
    assert.ok(x.peak<0.50,`rate=${rate} peak=${x.peak}`);
    assert.ok(x.jump<0.20,`rate=${rate} jump=${x.jump}`);
  }
  assert.throws(()=>new CabinSoundstage(0),RangeError);
});
test("P5-D: complete EngineSynthCore remains capped during EV cruise and fuelled acceleration",()=>{
  const dsp=new EngineSynthCore(48000,0x76b4,"i3");
  let peak=0,maximumJump=0,last=0;
  for(let i=0;i<48000;i++){
    const gas=i>=24000?0.85:0.1;
    const combustion=i>=24000?1:0;
    const sample=dsp.next(2400,0.7,gas,24,1,combustion,
      0.75,3500,0.15,0.6,2300,2,2,0,0.8,0.7,i>=18000?1:0,0.7);
    assert.ok(Number.isFinite(sample));
    peak=Math.max(peak,Math.abs(sample));
    maximumJump=Math.max(maximumJump,Math.abs(sample-last));
    last=sample;
  }
  assert.ok(peak<0.55);
  assert.ok(maximumJump<0.25,`sample transition ${maximumJump}`);
});
