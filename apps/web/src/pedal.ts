/** Convert absolute touch position on an analog pedal into 5% stepped opening.
 * Near the top = 100%, near the bottom = 0%. Invalid geometry stays released.
 * Edges include an inset so reaching the extremes does not require pixel precision.
 */
export function pedalOpeningFromPosition(clientY:number,top:number,height:number):number {
 if(!Number.isFinite(clientY)||!Number.isFinite(top)||!Number.isFinite(height)||height<=0)return 0;
 const inset=Math.min(16,height*0.1);
 const travel=height-2*inset;
 if(travel<=0)return 0;
 const raw=(top+height-inset-clientY)/travel;
 return Math.min(1,Math.max(0,Math.round(raw*20)/20));
}
