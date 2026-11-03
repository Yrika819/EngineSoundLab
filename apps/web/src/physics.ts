/** Generic automatic ICE prototype — not Toyota/Nissan calibration. */
export interface DriverInput { throttle: number; brake: number; }
export interface VehicleState { timeSec:number; speedMps:number; rpm:number; load:number; accelerationMps2:number; gear:number; }
export const IDLE_RPM=850, REDLINE_RPM=6500;
const ratios=[3.55,2.1,1.43,1.07,0.82], finalRatio=3.7, mass=1375, radius=0.31;
export const clamp=(x:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,Number.isFinite(x)?x:0));
export const initialState=():VehicleState=>({timeSec:0,speedMps:0,rpm:IDLE_RPM,load:0,accelerationMps2:0,gear:1});
export function step(s:VehicleState,input:DriverInput,dt:number):VehicleState {
 if(!Number.isFinite(dt)||dt<=0||dt>0.05)throw new RangeError("invalid fixed timestep");
 const gas=clamp(input.throttle,0,1),brake=clamp(input.brake,0,1);
 const wheelRpm=s.speedMps/(2*Math.PI*radius)*60;
 let gear=s.gear, ratio=ratios[gear-1]*finalRatio;
 if(gear<5 && wheelRpm*ratio>5500 && gas>0.1)gear++;
 else if(gear>1 && wheelRpm*ratio<1250)gear--;
 ratio=ratios[gear-1]*finalRatio;
 const targetRpm=clamp(Math.max(IDLE_RPM,wheelRpm*ratio,IDLE_RPM+gas*1700*Math.exp(-s.speedMps/5)),IDLE_RPM,REDLINE_RPM);
 const rpm=clamp(s.rpm+(targetRpm-s.rpm)*(1-Math.exp(-dt/0.18)),IDLE_RPM,REDLINE_RPM);
 const torqueShape=clamp(0.55+0.45*(1-Math.pow((rpm/REDLINE_RPM-0.57)/0.6,2)),0.3,1);
 const drive=gas*200*torqueShape*ratio*0.82/radius;
 const drag=0.5*1.225*0.68*s.speedMps**2;
 const rolling=s.speedMps>0.01?mass*9.81*0.012:0;
 const acceleration=clamp((drive-drag-rolling-brake*8500)/mass,-7,5);
 const speed=Math.max(0,s.speedMps+acceleration*dt);
 return {timeSec:s.timeSec+dt,speedMps:speed,rpm,load:clamp(gas*torqueShape,0,1),accelerationMps2:speed===0&&acceleration<0?0:acceleration,gear};
}
