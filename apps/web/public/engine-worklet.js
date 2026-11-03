/* Original procedural four-stroke I4 sound prototype: zero samples. */
class EngineWorklet extends AudioWorkletProcessor {
 static get parameterDescriptors(){return [{name:"rpm",defaultValue:850,minValue:0,maxValue:8000,automationRate:"k-rate"},{name:"load",defaultValue:0,minValue:0,maxValue:1,automationRate:"k-rate"},{name:"active",defaultValue:0,minValue:0,maxValue:1,automationRate:"k-rate"}];}
 constructor(){super();this.phase=0;this.rpm=850;this.load=0;this.active=0;this.dc=0;this.previous=0;this.breath=0;}
 process(_inputs,outputs,parameters){
  const channels=outputs[0];if(!channels?.length)return true;
  const left=channels[0],right=channels[1],alpha=Math.exp(-1/(sampleRate*0.018));
  for(let i=0;i<left.length;i++){
   this.rpm=this.rpm*alpha+parameters.rpm[0]*(1-alpha);
   this.load=this.load*alpha+parameters.load[0]*(1-alpha);
   this.active=this.active*alpha+parameters.active[0]*(1-alpha);
   this.phase=(this.phase+2*Math.PI*this.rpm/30/sampleRate)%(2*Math.PI);
   const p=this.phase;
   const voice=Math.sin(p)+0.40*Math.sin(2*p+0.24)+0.22*Math.sin(3*p+0.5)+0.11*Math.sin(4*p+1);
   this.breath=this.breath*0.985+(Math.random()*2-1)*0.015;
   const raw=(Math.tanh(voice*(1.3+this.load*0.9))*(0.20+this.load*0.24)+this.breath*(0.16+this.load*0.3))*this.active;
   this.dc=raw-this.previous+0.995*this.dc;this.previous=raw;
   const sample=Math.tanh(this.dc)*0.35;left[i]=sample;if(right)right[i]=sample;
  }return true;
 }
}
registerProcessor("engine-synth-p0",EngineWorklet);
