import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const widths = [320, 360, 390, 430];
const variants = [
  { name: "prius", id: "prius_60_hev", selector: ".gauge-prius", enhanced: false },
  { name: "aura-classic", id: "aura_fe13_epower", selector: ".gauge-aura", enhanced: false },
  { name: "aura-enhanced", id: "aura_fe13_epower", selector: ".gauge-aura", enhanced: true }
];
const scenes = ["EV", "ACCEL", "REGEN"];
const artifactDir = path.join("test-results", "p6-visual");

test.describe("P6.1 real mobile browser visual matrix", () => {
  for (const variant of variants) for (const width of widths) for (const scene of scenes) {
    test(variant.name+" / "+width+"px / "+scene, async ({ page }) => {
      const errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      await page.setViewportSize({width,height:780});
      await page.goto("/",{waitUntil:"load"});
      await page.waitForFunction(()=>typeof window.__ESL_VISUAL_QA__==="function");
      // This DEV-only fixture calls the actual production gauge draw function.
      await page.evaluate(({id,scene})=>window.__ESL_VISUAL_QA__(id,scene),
        {id:variant.id,scene});
      if (variant.enhanced)
        await page.locator("#gauge-style").selectOption("AURA_ENHANCED");
      const skin=page.locator(variant.selector);
      await expect(skin).toBeVisible();
      await expect(skin.locator("svg").first()).toBeVisible();
      await page.evaluate(()=>document.fonts.ready);
      await expect(page.locator(".gauge-skin:visible")).toHaveCount(1);

      // Actual DOM layout measurements—not a CSS string-presence test.
      const metrics=await page.evaluate(({selector,width})=>{
        const q=s=>document.querySelector(s);
        const skin=q(selector);
        const box=el=>{
          const r=el.getBoundingClientRect();
          return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
            width:r.width,height:r.height,midY:r.top+r.height/2};
        };
        const textSelectors=selector===".gauge-prius"
          ? ['[data-field="prius-speed"]','[data-field="prius-soc"]',
             '[data-field="prius-zone"]','[data-field="prius-drive"]']
          : ['[data-field="aura-speed"]','[data-field="aura-power"]',
             '[data-field="aura-mode"]','[data-field="aura-soc"]'];
        const texts=textSelectors.map(sel=>{
          const el=skin.querySelector(sel);
          return {selector:sel,text:(el.textContent||"").trim(),...box(el),
            fontSize:parseFloat(getComputedStyle(el).fontSize),
            scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
        });
        return {requestedWidth:width,viewportWidth:innerWidth,
          documentWidth:document.documentElement.scrollWidth,
          skin:box(skin),texts,
          aura:selector===".gauge-aura" ? {
            power:box(q(".aura-power")),speed:box(q(".aura-velocity")),
            center:box(q(".aura-center-panel"))} : null};
      },{selector:variant.selector,width});

      // Save every scenario before asserting, even when a layout fails,
      // so CI provides an inspectable screenshot of the actual defect.
      const name=variant.name+"-"+width+"px-"+scene.toLowerCase();
      await mkdir(artifactDir,{recursive:true});
      await skin.screenshot({path:path.join(artifactDir,name+".png"),animations:"disabled"});
      await writeFile(path.join(artifactDir,name+".json"),JSON.stringify(metrics,null,2)+"\n");
      if(width===320&&scene==="EV")
        await page.screenshot({path:path.join(artifactDir,variant.name+"-full-page.png"),
          fullPage:true,animations:"disabled"});

      expect(errors,"unhandled app errors").toEqual([]);
      expect(metrics.viewportWidth).toBe(width);
      expect(metrics.documentWidth,"horizontal viewport overflow").toBeLessThanOrEqual(width+1);
      expect(metrics.skin.left,"cluster clipped left").toBeGreaterThanOrEqual(-1);
      expect(metrics.skin.right,"cluster clipped right").toBeLessThanOrEqual(width+1);
      expect(metrics.skin.width).toBeGreaterThan(255);
      for(const e of metrics.texts){
        expect(e.text.length,e.selector+" is empty").toBeGreaterThan(0);
        expect(e.width,e.selector+" has no width").toBeGreaterThan(9);
        expect(e.left,e.selector+" clipped left").toBeGreaterThanOrEqual(metrics.skin.left-1);
        expect(e.right,e.selector+" clipped right").toBeLessThanOrEqual(metrics.skin.right+1);
        expect(e.scrollWidth,e.selector+" text overflow: "+e.text).toBeLessThanOrEqual(e.clientWidth+2);
        expect(e.fontSize,e.selector+" is illegible").toBeGreaterThanOrEqual(9);
      }

      if(metrics.aura){
        const {power,speed,center}=metrics.aura;
        expect(power.left).toBeLessThan(speed.left);
        expect(power.right,"POWER and SPEED overlap").toBeLessThan(speed.left);
        expect(Math.abs(power.midY-speed.midY),"dials not on the same row").toBeLessThan(4);
        expect(power.width,"POWER too small").toBeGreaterThanOrEqual(110);
        expect(speed.width,"SPEED too small").toBeGreaterThanOrEqual(110);
        if(width<=360){
          expect(center.top,"center strip overlaps top dial row")
            .toBeGreaterThanOrEqual(Math.min(power.bottom,speed.bottom)-2);
          expect(center.left).toBeGreaterThanOrEqual(power.left-2);
          expect(center.right).toBeLessThanOrEqual(speed.right+2);
        }else{
          expect(power.right,"POWER overlaps info pane").toBeLessThanOrEqual(center.left+2);
          expect(center.right,"info pane overlaps SPEED").toBeLessThanOrEqual(speed.left+2);
        }
        const motor=Number(await skin.locator('[data-field="aura-power"]').innerText());
        const speedNumber=Number(await skin.locator('[data-field="aura-speed"]').innerText());
        expect(speedNumber).toBeGreaterThan(0);
        if(scene==="REGEN")expect(motor).toBeLessThan(0);
        else expect(motor).toBeGreaterThan(0);
        await expect(skin.locator('[data-needle="power"]')).toHaveAttribute("transform",/^rotate\(/);
        await expect(skin.locator('[data-needle="speed"]')).toHaveAttribute("transform",/^rotate\(/);
        // P6.2: the short marker never crosses the central digital value.
        for(const kind of ["power","speed"]){
          const marker=skin.locator('[data-peripheral-needle="'+kind+'"]');
          await expect(marker).toHaveCount(1);
          await expect(marker).toHaveAttribute("d","M 100 10 L 94.6 28 L 105.4 28 Z");
        }
        const readouts=await skin.locator(".aura-dial-readout").evaluateAll(nodes=>
          nodes.map(node=>{
            const digit=node.querySelector("strong").getBoundingClientRect();
            const unit=node.querySelector("small").getBoundingClientRect();
            return {digitBottom:digit.bottom,unitTop:unit.top};
          }));
        for(const layout of readouts)
          expect(layout.unitTop,"unit overlaps the central numeral").toBeGreaterThanOrEqual(layout.digitBottom-2);
        if(scene==="REGEN")await expect(skin).toHaveClass(/regenerating/);
        if(scene==="ACCEL")await expect(skin).toHaveClass(/generating/);
        if(scene==="EV")await expect(skin).not.toHaveClass(/regenerating|generating/);
        const expectedMode=scene==="REGEN"?"regen":scene==="ACCEL"?"generation":"ev";
        await expect(skin).toHaveAttribute("data-energy-flow",expectedMode);
        // The arrow itself is route-specific. An Aura engine generator never
        // substitutes the EV battery-to-wheel arrow.
        const activeRoute=skin.locator('[data-route="'+expectedMode+'"]');
        await expect(activeRoute).toHaveCSS("opacity","1");
        await expect(skin.locator('[data-route="'+(scene==="REGEN"?"ev":"regen")+'"]'))
          .toHaveCSS("opacity","0");
        if(scene==="ACCEL")
          await expect(skin.locator(".energy-generator")).toHaveCSS("opacity","1");
        else
          await expect(skin.locator(".energy-generator")).toHaveCSS("opacity","0");
        expect(await skin.locator('[data-ring="power"]').getAttribute("d")).toMatch(/^M /);
        await expect(skin.locator('[data-field="aura-mode"]'))
          .toHaveText(scene==="REGEN"?"REGEN":scene==="ACCEL"?"GENERATING":"EV DRIVE");
      }else{
        expect(await skin.locator('[data-ring="prius"]').getAttribute("d")).toMatch(/^M /);
        await expect(skin.locator('[data-field="prius-ev"]'))
          .toHaveText(scene==="ACCEL"?"HEV":"EV");
        await expect(skin.locator('[data-field="prius-zone"]'))
          .toHaveText(scene==="REGEN"?"CHARGE":scene==="ACCEL"?"POWER":"ECO");
        await expect(skin).toHaveAttribute("data-energy-flow",
          scene==="REGEN"?"regen":scene==="ACCEL"?"hybrid":"ev");
        await expect(skin.locator(".prius-flow-strip i")).toHaveCount(3);
        await expect(skin.locator(".prius-right-readout .prius-gear")).toContainText("D");
        await expect(skin.locator(".prius-speed-readout .prius-gear")).toHaveCount(0);
        if(scene==="ACCEL"){
          await expect(skin.locator('[data-field="prius-drive"]')).toHaveText("HEV");
          await expect(skin.locator('[data-field="prius-drive"]'))
            .toHaveAttribute("aria-label","HYBRID DRIVE");
          await expect(skin.locator('[data-field="prius-flow"]'))
            .toHaveText("HEV駆動");
          await expect(skin.locator('[data-field="prius-flow"]'))
            .toHaveAttribute("aria-label","エンジン＋モーター → 車輪");
        }
      }


    });
  }

  // P6.3: same-car transitions without resetting the page. State text must
  // update synchronously while the visual needle approaches its next target.
  for (const id of ["aura_fe13_epower","prius_60_hev"]) {
    test("smooth live transitions "+id,async({page})=>{
      await page.setViewportSize({width:390,height:780});
      await page.goto("/");
      await page.waitForFunction(()=>typeof window.__ESL_VISUAL_QA__==="function");
      const update=scene=>page.evaluate(([car,mode])=>
        window.__ESL_VISUAL_QA__(car,mode),[id,scene]);
      await update("EV");
      const skin=page.locator(id==="aura_fe13_epower"?".gauge-aura":".gauge-prius");
      const circle=id==="aura_fe13_epower";
      const needle=skin.locator('[data-needle="speed"]');
      const initial=circle?await needle.getAttribute("transform"):
        await skin.locator('[data-ring="prius"]').getAttribute("d");
      await update("ACCEL");
      const immediate=circle?await needle.getAttribute("transform"):
        await skin.locator('[data-ring="prius"]').getAttribute("d");
      // One telemetry frame cannot jump instantaneously to the new target.
      expect(immediate).toBe(initial);
      if(circle){
        await expect(skin).toHaveAttribute("data-energy-flow","generation");
        await expect(skin.locator('[data-field="aura-mode"]')).toHaveText("GENERATING");
      }else{
        await expect(skin).toHaveAttribute("data-energy-flow","hybrid");
        await expect(skin.locator('[data-field="prius-drive"]')).toHaveText("HEV");
      }
      await expect.poll(async()=>circle?needle.getAttribute("transform"):
        skin.locator('[data-ring="prius"]').getAttribute("d"),{timeout:2200})
        .not.toBe(initial);
      const after=circle?await needle.getAttribute("transform"):
        await skin.locator('[data-ring="prius"]').getAttribute("d");
      await update("REGEN");
      await expect(skin).toHaveAttribute("data-energy-flow","regen");
      if(circle){
        await expect(skin.locator('[data-field="aura-power"]')).toContainText("-");
        await expect(skin.locator('[data-route="regen"]')).toHaveCSS("opacity","1");
        await expect.poll(async()=>needle.getAttribute("transform"),{timeout:2500})
          .not.toBe(after);
      }else{
        await expect(skin.locator('[data-field="prius-zone"]')).toHaveText("CHARGE");
        await expect.poll(async()=>skin.locator('[data-ring="prius"]').getAttribute("d"),
          {timeout:2500}).not.toBe(after);
      }
    });
  }

  test("Aura generator-to-battery lane only activates when generator is charging the pack",
    async({page})=>{
      await page.setViewportSize({width:390,height:780});
      await page.goto("/");
      await page.waitForFunction(()=>typeof window.__ESL_VISUAL_QA__==="function");
      await page.evaluate(()=>window.__ESL_VISUAL_QA__("aura_fe13_epower","ACCEL"));
      const aura=page.locator(".gauge-aura");
      await expect(aura).toHaveAttribute("data-energy-flow","generation");
      await expect(aura).toHaveAttribute("data-battery-charging","false");
      await expect(aura.locator('[data-route="charging"]')).toHaveCSS("opacity","0");
      await page.evaluate(()=>window.__ESL_VISUAL_QA__("aura_fe13_epower","GEN_CHARGE"));
      await expect(aura).toHaveAttribute("data-energy-flow","generation");
      await expect(aura).toHaveAttribute("data-battery-charging","true");
      await expect(aura.locator('[data-route="generation"]')).toHaveCSS("opacity","1");
      await expect(aura.locator('[data-route="charging"]')).toHaveCSS("opacity","1");
      await expect(aura.locator('[data-route="regen"]')).toHaveCSS("opacity","0");
      // A pure regeneration state has no separate combustion generator feed.
      await page.evaluate(()=>window.__ESL_VISUAL_QA__("aura_fe13_epower","REGEN"));
      await expect(aura).toHaveAttribute("data-energy-flow","regen");
      await expect(aura.locator('[data-route="charging"]')).toHaveCSS("opacity","0");
    });

  test("reduced-motion preference leaves accurate static flow arrows without animated needles",
    async({page})=>{
      await page.emulateMedia({reducedMotion:"reduce"});
      await page.goto("/");
      await page.waitForFunction(()=>typeof window.__ESL_VISUAL_QA__==="function");
      await page.evaluate(()=>window.__ESL_VISUAL_QA__("aura_fe13_epower","EV"));
      await page.evaluate(()=>window.__ESL_VISUAL_QA__("aura_fe13_epower","REGEN"));
      const aura=page.locator(".gauge-aura");
      await expect(aura).toHaveAttribute("data-energy-flow","regen");
      await expect(aura.locator('[data-route="regen"]')).toHaveCSS("opacity","1");
      await expect(aura.locator('[data-route="regen"]')).toHaveCSS("animation-name","none");
      await expect(aura.locator('[data-needle="speed"]'))
        .toHaveAttribute("transform",/^rotate\(/);
      // The generator path stays hidden during regeneration.
      await expect(aura.locator('[data-route="generation"]')).toHaveCSS("opacity","0");
    });

  test("dev-only fixture rejects unsupported car and does not start audio",async({page})=>{
    await page.goto("/");
    await page.waitForFunction(()=>typeof window.__ESL_VISUAL_QA__==="function");
    const error=await page.evaluate(()=>{
      try{window.__ESL_VISUAL_QA__("generic_i4","ACCEL");return false}
      catch(e){return e instanceof RangeError}
    });
    expect(error).toBe(true);
    await expect(page.locator("#status")).toContainText("停止中");
  });
});
