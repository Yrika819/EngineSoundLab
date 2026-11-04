import "./style.css";
import { clamp, REDLINE_RPM } from "./physics";
import type { DriverInput } from "./physics";
import { advanceDrive, makeDriveState, type DriveState, type VehicleId } from "./powertrains";
import { EngineAudio } from "./audio";
import type { EngineSoundProfile } from "./audio";
import { pedalOpeningFromPosition } from "./pedal";
import { createGaugePanel } from "./gauge-ui";
import { registerOfflineApp } from "./pwa";

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
const soundProfile=el<HTMLSelectElement>("sound-profile");
const vehicleProfile=el<HTMLSelectElement>("vehicle-profile");
const listenerModeSelect=el<HTMLSelectElement>("listener-mode");
const roadSurfaceSelect=el<HTMLSelectElement>("road-surface");
const hybridBalanceSelect=el<HTMLSelectElement>("hybrid-balance");
const energyPanel=el<HTMLElement>("energy-panel");
const batterySoc=el<HTMLElement>("battery-soc");
const enginePhaseText=el<HTMLElement>("engine-state");
const motorPower=el<HTMLElement>("motor-power");
const generatorPower=el<HTMLElement>("generator-power");
const powertrainNotice=el<HTMLElement>("powertrain-notice");
const offlineStatus=el<HTMLElement>("offline-status");
const gaugePanel=createGaugePanel(dial,energyPanel);
soundProfile.addEventListener("change",()=>{
  const profile=soundProfile.value as EngineSoundProfile;
  audio?.setProfile(profile);
  hint.textContent="合成音を"+soundProfile.selectedOptions[0].text+"に切替。車両の走行モデルは共通です。";
});
let vehicle:DriveState=makeDriveState("generic_i4");
const input:DriverInput={throttle:0,brake:0};
let running=false,busy=false,lastFrame=0,accumulator=0,lastPaint=0;
let animationHandle: number | null = null;
let audio:EngineAudio|null=null;
const cancelPedals:Array<()=>void>=[];
listenerModeSelect.addEventListener("change",()=>{
 const mode=listenerModeSelect.value;
 if(mode!=="CABIN" && mode!=="ENGINE_BAY")return;
 audio?.setListenerMode(mode);
 hint.textContent=mode==="CABIN"
  ?"車内での推定遮音・ロードノイズを再現しています。"
  :"エンジンルーム視点（比較用の合成音・実車録音ではありません）。";
});
hybridBalanceSelect.addEventListener("change",()=>{
 const selected=Number(hybridBalanceSelect.value);
 if(![-1,0,1].includes(selected))return;
 audio?.setHybridBalance(selected);
 hint.textContent=selected===1?"電動音を強調しています（比較用の音量調整）。"
  :selected===-1?"エンジン音を強調しています（比較用の音量調整）。"
  :"標準のハイブリッド音響バランスです。";
});
roadSurfaceSelect.addEventListener("change",()=>{
 const roughness=Number(roadSurfaceSelect.value);
 if(![0,0.35,1].includes(roughness))return;
 audio?.setRoadRoughness(roughness);
 hint.textContent="路面の粗さに応じてタイヤの走行音を調整しました。";
});

function bindPedal(button:HTMLButtonElement,key:keyof DriverInput):void {
 let pointer:number|null=null;
 const sync=()=>{
   const percent=Math.round(input[key]*100);
   button.style.setProperty("--pedal-level",percent+"%");
   button.setAttribute("aria-valuenow",String(percent));
   button.setAttribute("aria-valuetext",percent+"パーセント");
 };
 const clear=()=>{pointer=null;input[key]=0;button.classList.remove("pressed");sync();};
 const setFromY=(y:number)=>{
   const rect=button.getBoundingClientRect();
   input[key]=pedalOpeningFromPosition(y,rect.top,rect.height);
   sync();
 };
 cancelPedals.push(clear);
 button.addEventListener("pointerdown",event=>{
   if(!running||pointer!==null)return;
   pointer=event.pointerId;
   button.setPointerCapture(event.pointerId);
   button.classList.add("pressed");
   setFromY(event.clientY);
   event.preventDefault();
 });
 button.addEventListener("pointermove",event=>{
   if(pointer===event.pointerId)setFromY(event.clientY);
 });
 for(const type of ["pointerup","pointercancel","lostpointercapture"]){
   button.addEventListener(type,event=>{
     if(pointer===(event as PointerEvent).pointerId)clear();
   });
 }
 button.addEventListener("keydown",event=>{
   if(!running)return;
   const keyname=event.key;
   if(!["ArrowUp","ArrowRight","ArrowDown","ArrowLeft","Home","End","PageUp","PageDown"].includes(keyname))return;
   event.preventDefault();
   if(keyname==="Home")input[key]=0;
   else if(keyname==="End")input[key]=1;
   else {
     const delta=keyname==="PageUp"?0.25:keyname==="PageDown"?-0.25:
       keyname==="ArrowUp"||keyname==="ArrowRight"?0.05:-0.05;
     input[key]=clamp(Math.round((input[key]+delta)*20)/20,0,1);
   }
   button.classList.add("pressed");sync();
 });
 button.addEventListener("keyup",event=>{
   if(["ArrowUp","ArrowRight","ArrowDown","ArrowLeft","Home","End","PageUp","PageDown"].includes(event.key))clear();
 });
 button.addEventListener("blur",clear);
 sync();
}
bindPedal(gas,"throttle");bindPedal(brake,"brake");
vehicleProfile.addEventListener("change",()=>{
 const id=vehicleProfile.value as VehicleId;
 if(!["generic_i4","prius_60_hev","aura_fe13_epower"].includes(id))return;
 clearPedals();
 vehicle=makeDriveState(id);
 gaugePanel.onVehicleChange(id);
 hybridBalanceSelect.disabled=id==="generic_i4";
 accumulator=0;lastFrame=0;
 const profile=id==="aura_fe13_epower"?"i3":"i4";
 soundProfile.value=profile;
 audio?.setProfile(profile);
 powertrainNotice.textContent=id==="generic_i4"
   ?"汎用ガソリン車の走行モデル（試作）"
   :"メーカー未公開の制御値は推定としたハイブリッド近似モデル";
 hint.textContent="車両モデルを変更しました。走行状態を初期化します。";
 draw();
});
const clearPedals=()=>cancelPedals.forEach(clear=>clear());

function draw():void {
 rpm.textContent=Math.round(vehicle.rpm).toLocaleString("ja-JP");
 speed.textContent=String(Math.round(vehicle.speedMps*3.6));
 gear.textContent=vehicle.vehicleId==="generic_i4"?"D"+vehicle.gear:"D";
 load.textContent=Math.round(vehicle.load*100)+"%";
 throttle.textContent=Math.round(input.throttle*100)+"%";
 gasVal.textContent=Math.round(input.throttle*100)+"%";
 brakeVal.textContent=Math.round(input.brake*100)+"%";
 const isHybrid=vehicle.vehicleId!=="generic_i4";
 energyPanel.hidden=!isHybrid;
 if(isHybrid){
  batterySoc.textContent=Math.round((vehicle.batterySoc??0)*100)+"%";
  enginePhaseText.textContent=vehicle.engineOperation==="RUNNING_FUELLED"?"燃焼稼働中":
    vehicle.engineOperation==="SPINNING_UNFUELLED"?"燃焼なし回転":
    vehicle.engineOperation==="STARTING"?"始動中":
    vehicle.engineOperation==="STOPPING"?"停止動作":"停止";
  motorPower.textContent=vehicle.motorPowerKw.toFixed(1)+" kW";
  generatorPower.textContent=vehicle.generatorPowerKw.toFixed(1)+" kW";
 }
 dial.style.setProperty("--rpm-angle",(vehicle.rpm/REDLINE_RPM*300).toFixed(1)+"deg");
 gaugePanel.render(vehicle);
}
function animation(timestamp:number):void {
 if(!running)return;
 if(!lastFrame)lastFrame=timestamp;
 accumulator+=Math.min(0.05,Math.max(0,(timestamp-lastFrame)/1000));lastFrame=timestamp;
 let count=0;
 while(accumulator>=0.01 && count++<5){vehicle=advanceDrive(vehicle,input,0.01);accumulator-=0.01;}
 audio?.update(vehicle, input.throttle);
 // Meter DOM updates run at ~30 FPS; physics/audio remain responsive at 100/60 Hz.
 if(timestamp-lastPaint>=32){draw();lastPaint=timestamp;}
 animationHandle=requestAnimationFrame(animation);
}
async function halt():Promise<void> {
 running=false;clearPedals();lastFrame=0;accumulator=0;lastPaint=0;
 if(animationHandle!==null){cancelAnimationFrame(animationHandle);animationHandle=null;}
 gas.disabled=brake.disabled=true;
 // Update UI synchronously before awaiting the browser's audio suspension.
 status.textContent="停止中";status.classList.remove("active");
 power.textContent="走行シミュレーション開始 ▶";
 hint.textContent="再開すると前回の走行状態から続きます。";
 draw();
 await audio?.suspend();
}
power.addEventListener("click",async()=>{
 if(busy)return;busy=true;power.disabled=true;
 try {
   if(running){await halt();}
   else{
     if(!audio)audio=new EngineAudio();
     audio.setProfile(soundProfile.value as EngineSoundProfile);
     audio.setListenerMode(listenerModeSelect.value==="ENGINE_BAY"?"ENGINE_BAY":"CABIN");
     audio.setRoadRoughness(Number(roadSurfaceSelect.value));
     audio.setHybridBalance(Number(hybridBalanceSelect.value));
     await audio.start();
     // A slow AudioWorklet load must not start playback after app backgrounding.
     if(document.hidden){
       await audio.suspend();
       clearPedals();
       hint.textContent="アプリが非表示になったため開始を中止しました。";
       return;
     }
     running=true;gas.disabled=brake.disabled=false;
     status.textContent="合成音・走行中";status.classList.add("active");
     power.textContent="シミュレーション停止 ■";
     hint.textContent=audio.simplified?"簡易合成フォールバックで再生しています。":"アクセルを長押しして加速。下に動かすと開度を減らせます。";
     lastFrame=0;lastPaint=0;
     animationHandle=requestAnimationFrame(animation);
   }
 } catch(error){
   console.error(error);running=false;clearPedals();gas.disabled=brake.disabled=true;
   status.textContent="音声エラー";hint.textContent="音声設定とHTTPS環境を確認してください。";
   power.textContent="再試行";
   await audio?.dispose().catch(console.error);audio=null;
 } finally {busy=false;power.disabled=false;}
});
function pauseForInterruption(): void {
 clearPedals();
 if(running) void halt().catch(error => console.warn("Unable to suspend audio",error));
}
document.addEventListener("visibilitychange",()=>{
 if(document.hidden) pauseForInterruption();
});
// Clearing controls is immediate even if the browser doesn't fire pointercancel.
window.addEventListener("blur",clearPedals);
window.addEventListener("resize",clearPedals);
window.addEventListener("pagehide",pauseForInterruption);
window.addEventListener("pageshow",event=>{
 if(event.persisted)pauseForInterruption(); // bfcache restore never resumes throttle/audio
});
draw();

// Development-only visual QA seam: exercise the REAL gauge UI with deterministic
// DriveState fixtures, without waiting for real-time acceleration or starting
// audio. Vite removes this code from the production bundle.
if (import.meta.env.DEV) {
 const qa = window as Window & {
  __ESL_VISUAL_QA__?: (id: VehicleId, scene: "EV" | "ACCEL" | "REGEN" | "GEN_CHARGE") => void
 };
 qa.__ESL_VISUAL_QA__ = (id, scene) => {
  if (running) throw new Error("Stop playback before running visual QA");
  if (id !== "prius_60_hev" && id !== "aura_fe13_epower")
   throw new RangeError("Visual QA supports only the two hybrid cars");
  if (!["EV", "ACCEL", "REGEN", "GEN_CHARGE"].includes(scene))
   throw new RangeError("Unsupported visual QA driving scene");
  vehicleProfile.value = id;
  vehicleProfile.dispatchEvent(new Event("change", { bubbles: true }));
  const generatorCharging = scene === "GEN_CHARGE";
  const accelerating = scene === "ACCEL" || generatorCharging;
  const recovering = scene === "REGEN";
  vehicle = {
   ...makeDriveState(id),
   speedMps: accelerating ? 31.1 : recovering ? 15 : 7.2,
   rpm: accelerating ? (id === "aura_fe13_epower" ? 2700 : 3100) : 0,
   load: accelerating ? .78 : 0,
   enginePhase: accelerating ? "RUNNING" : "STOPPED",
   engineOperation: accelerating ? "RUNNING_FUELLED" : "STOPPED",
   combustionActive: accelerating,
   batterySoc: accelerating ? .51 : recovering ? .71 : .64,
   batteryPowerKw: generatorCharging ? -6 : accelerating ? 18 : recovering ? -12 : 8,
   motorPowerKw: accelerating ? 48 : recovering ? -17 : 13,
   tractionMotorTorqueNm: accelerating ? 180 : recovering ? -125 : 86,
   generatorPowerKw: accelerating ? 17 : 0,
   regenPowerKw: recovering ? 12 : 0,
   engineMechanicalKw: accelerating ? 65 : 0,
   mg1Rpm: accelerating ? 2800 : 0,
   mg2Rpm: accelerating ? 6100 : recovering ? 2900 : 1900
  };
  draw();
 };
}

void registerOfflineApp(message=>{offlineStatus.textContent=message;});
