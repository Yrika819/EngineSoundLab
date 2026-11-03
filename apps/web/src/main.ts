import "./style.css";
import { clamp, initialState, step, REDLINE_RPM } from "./physics";
import type { DriverInput, VehicleState } from "./physics";
import { EngineAudio } from "./audio";

function el<T extends HTMLElement>(id:string):T {
 const node=document.getElementById(id);
 if(!node)throw new Error("UI element missing: "+id);
 return node as T;
}
const power=el<HTMLButtonElement>("power"),gas=el<HTMLButtonElement>("accelerator"),brake=el<HTMLButtonElement>("brake");
const status=el<HTMLSpanElement>("status"),hint=el<HTMLParagraphElement>("hint");
const rpm=el<HTMLElement>("rpm"),speed=el<HTMLElement>("speed"),gear=el<HTMLElement>("gear");
const load=el<HTMLElement>("load"),throttle=el<HTMLElement>("throttle"),gasVal=el<HTMLElement>("gas-value"),brakeVal=el<HTMLElement>("brake-value");
const dial=el<HTMLDivElement>("dial");
let vehicle:VehicleState=initialState();
const input:DriverInput={throttle:0,brake:0};
let running=false,busy=false,lastFrame=0,accumulator=0;
let audio:EngineAudio|null=null;
const cancelPedals:Array<()=>void>=[];

function bindPedal(button:HTMLButtonElement,key:keyof DriverInput):void {
 let pointer:number|null=null,startY=0;
 const clear=()=>{pointer=null;input[key]=0;button.classList.remove("pressed");};
 cancelPedals.push(clear);
 button.addEventListener("pointerdown",event=>{
   if(!running||pointer!==null)return;
   pointer=event.pointerId;startY=event.clientY;input[key]=1;
   button.classList.add("pressed");button.setPointerCapture(event.pointerId);event.preventDefault();
 });
 button.addEventListener("pointermove",event=>{
   if(pointer===event.pointerId)input[key]=clamp(1-(event.clientY-startY)/135,0,1);
 });
 for(const type of ["pointerup","pointercancel","lostpointercapture"]){
   button.addEventListener(type,event=>{if(pointer===(event as PointerEvent).pointerId)clear();});
 }
}
bindPedal(gas,"throttle");bindPedal(brake,"brake");
const clearPedals=()=>cancelPedals.forEach(clear=>clear());

function draw():void {
 rpm.textContent=Math.round(vehicle.rpm).toLocaleString("ja-JP");
 speed.textContent=String(Math.round(vehicle.speedMps*3.6));
 gear.textContent="D"+vehicle.gear;
 load.textContent=Math.round(vehicle.load*100)+"%";
 throttle.textContent=Math.round(input.throttle*100)+"%";
 gasVal.textContent=Math.round(input.throttle*100)+"%";
 brakeVal.textContent=Math.round(input.brake*100)+"%";
 dial.style.setProperty("--rpm-angle",(vehicle.rpm/REDLINE_RPM*300).toFixed(1)+"deg");
}
function animation(timestamp:number):void {
 if(!running)return;
 if(!lastFrame)lastFrame=timestamp;
 accumulator+=Math.min(0.05,Math.max(0,(timestamp-lastFrame)/1000));lastFrame=timestamp;
 let count=0;
 while(accumulator>=0.01 && count++<5){vehicle=step(vehicle,input,0.01);accumulator-=0.01;}
 audio?.update(vehicle);draw();requestAnimationFrame(animation);
}
async function halt():Promise<void> {
 running=false;clearPedals();lastFrame=0;accumulator=0;
 gas.disabled=brake.disabled=true;
 await audio?.suspend();
 status.textContent="停止中";status.classList.remove("active");
 power.textContent="エンジンを始動 ▶";
 hint.textContent="再開すると前回の走行状態から続きます。";
 draw();
}
power.addEventListener("click",async()=>{
 if(busy)return;busy=true;power.disabled=true;
 try {
   if(running){await halt();}
   else{
     if(!audio)audio=new EngineAudio();
     await audio.start();running=true;gas.disabled=brake.disabled=false;
     status.textContent="合成音・走行中";status.classList.add("active");
     power.textContent="エンジンを停止 ■";
     hint.textContent=audio.simplified?"簡易合成フォールバックで再生しています。":"アクセルを長押しして加速。下に動かすと開度を減らせます。";
     lastFrame=0;requestAnimationFrame(animation);
   }
 } catch(error){
   console.error(error);running=false;clearPedals();gas.disabled=brake.disabled=true;
   status.textContent="音声エラー";hint.textContent="音声設定とHTTPS環境を確認してください。";
   power.textContent="再試行";
   await audio?.dispose().catch(console.error);audio=null;
 } finally {busy=false;power.disabled=false;}
});
document.addEventListener("visibilitychange",()=>{
 if(document.hidden && running && !busy)void halt();
});
window.addEventListener("pagehide",()=>{clearPedals();running=false;void audio?.dispose();});
draw();
