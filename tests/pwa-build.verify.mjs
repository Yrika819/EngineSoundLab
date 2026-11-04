import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const dist = fileURLToPath(new URL("../dist/web/", import.meta.url));
const load = name => readFileSync(join(dist, name));
const html = load("index.html").toString("utf8");
const manifest = JSON.parse(load("manifest.webmanifest").toString("utf8"));
const sw = load("sw.js").toString("utf8");
const assets = readdirSync(join(dist, "assets")).filter(name => /\.(?:js|css)$/.test(name));
const matches = /const PRECACHE = (\[[^\n]+\]);/.exec(sw);
assert.ok(matches, "missing build-time PRECACHE declaration");
const precache = JSON.parse(matches[1]);

test("production HTML is installable and has an offline readiness indicator",()=>{
 assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
 assert.match(html, /apple-touch-icon\.png/);
 assert.match(html, /id="offline-status"/);
 assert.match(html, /<meta name="viewport"/);
 assert.match(html, /src="\.\/assets\//);
});
test("PWA manifest uses relative scope for GitHub Pages and dedicated icons",()=>{
 assert.equal(manifest.start_url,"./");
 assert.equal(manifest.scope,"./");
 assert.equal(manifest.id,"./");
 assert.equal(manifest.display,"standalone");
 assert.equal(manifest.lang,"ja");
 for(const [filename,size] of [
  ["apple-touch-icon.png",180],["icon-192.png",192],["icon-512.png",512]
 ]) {
  const png=load(filename);
  assert.ok(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  assert.equal(png.readUInt32BE(16),size);
  assert.equal(png.readUInt32BE(20),size);
 }
 assert.ok(manifest.icons.some(x=>x.sizes==="192x192" && x.type==="image/png"));
 assert.ok(manifest.icons.some(x=>x.sizes==="512x512" && x.type==="image/png"));
});
test("all hashed app bundles and offline synthesis modules are precached",()=>{
 assert.ok(assets.some(x=>x.endsWith(".js")));
 assert.ok(assets.some(x=>x.endsWith(".css")));
 const required=[
  "./","./index.html","./manifest.webmanifest","./icon.svg",
  "./apple-touch-icon.png","./icon-192.png","./icon-512.png",
  "./engine-worklet.js","./synth-core.js","./electric-synth.js","./vehicle-combustion.js",
  ...assets.map(a=>"./assets/"+a)
 ];
 for(const path of required){
  assert.ok(precache.includes(path),"offline asset missing: "+path);
  if(path!=="./")assert.ok(existsSync(join(dist,path)),"missing physical asset: "+path);
 }
 assert.equal(new Set(precache).size,precache.length,"duplicate offline asset");
 assert.match(sw,/const CACHE_NAME = "enginesoundlab-shell-[0-9a-f]{16}";/);
 assert.doesNotMatch(sw,/skipWaiting\s*\(/);
});
test("worker installs relative to subpath, keeps offline navigation available and rejects cross-scope URLs",async()=>{
 const handlers=new Map();
 const cache=new Map();
 const deleted=[];
 const previous="enginesoundlab-shell-previous";
 const scope="https://yrika819.github.io/EngineSoundLab/";
 const fakeCache={
  addAll:async urls=>{for(const url of urls) cache.set(url.href,{source:"cached",url:url.href});},
  match:async request=>cache.get(typeof request==="string"?request:(request.href??request.url))
 };
 const fakeCaches={
  open:async()=>fakeCache,
  keys:async()=>[previous,"some-other-app-cache",(/const CACHE_NAME = "([^"]+)"/.exec(sw))[1]],
  match:async request=>fakeCache.match(request),
  delete:async name=>{deleted.push(name);return true;}
 };
 const self={
  registration:{scope},
  addEventListener:(eventName,handler)=>handlers.set(eventName,handler)
 };
 let networkCalls=0;
 vm.runInNewContext(sw,{self,caches:fakeCaches,URL,
  fetch:async()=>{networkCalls++;throw new Error("offline");}});
 let installTask;
 handlers.get("install")({waitUntil:p=>{installTask=p;}});
 await installTask;
 assert.ok(cache.has(scope+"index.html"));
 assert.ok(cache.has(scope+"engine-worklet.js"));
 assert.ok(cache.has(scope+"electric-synth.js"));
 assert.ok(cache.has(scope+"vehicle-combustion.js"));
 assert.ok([...cache.keys()].every(url=>url.startsWith(scope)));
 let response;
 const navRequest={url:scope,method:"GET",mode:"navigate"};
 handlers.get("fetch")({request:navRequest,respondWith:p=>{response=p;}});
 const navigation=await response;
 assert.equal(navigation.source,"cached");
 assert.equal(navigation.url,scope+"index.html");
 const moduleRequest={url:scope+"electric-synth.js",method:"GET",mode:"same-origin"};
 handlers.get("fetch")({request:moduleRequest,respondWith:p=>{response=p;}});
 assert.equal((await response).url,moduleRequest.url);
 assert.equal(networkCalls,0);
 let invoked=false;
 for(const request of [
  {url:"https://unrelated.example/a.js",method:"GET",mode:"same-origin"},
  {url:"https://yrika819.github.io/OtherApp/app.js",method:"GET",mode:"same-origin"},
  {url:scope+"data",method:"POST",mode:"cors"}
 ]){
  handlers.get("fetch")({request,respondWith:()=>{invoked=true;}});
 }
 assert.equal(invoked,false,"worker should not intercept unrelated traffic");
 let activateTask;
 handlers.get("activate")({waitUntil:p=>{activateTask=p;}});
 await activateTask;
 assert.deepEqual(deleted,[previous],"unrelated caches must never be deleted");
});
