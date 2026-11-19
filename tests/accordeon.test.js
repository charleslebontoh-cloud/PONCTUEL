const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--ignore-gpu-blocklist']});
const ctx=await b.newContext({viewport:{width:400,height:820},geolocation:{latitude:5.3480,longitude:-4.0040},permissions:['geolocation']});
const p=await ctx.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
await p.addInitScript(()=>localStorage.setItem('pc_settings',JSON.stringify({key:'DEMO',v3d:2,voice:false})));
await p.route(/openfreemap|orbis|fonts|arcgis|traffic\/map|media\/|elevation|flowSegment/,r=>r.fulfill({status:404,body:''}));
await p.route(/calculateRoute/,r=>{const u=r.request().url();const m=u.match(/calculateRoute\/([\d.\-]+),([\d.\-]+):/);const la=+m[1],lo=+m[2];
 const pts=[];for(let i=0;i<=60;i++)pts.push({latitude:la+(5.3215-la)*i/60,longitude:lo});
 const dist=Math.round((la-5.3215)*111320); r.fulfill({json:{routes:[{summary:{lengthInMeters:dist,travelTimeInSeconds:Math.round(dist/12.5),trafficDelayInSeconds:0,noTrafficTravelTimeInSeconds:Math.round(dist/12.5)},legs:[{points:pts}],sections:[],guidance:{instructions:[]}}]}});});
await p.goto('http://localhost:8765/');await p.waitForTimeout(2500);await p.click('#skipSplash').catch(()=>{});
await p.evaluate(async()=>{setB({lat:5.3215,lng:-4.0040,name:'BHCI'});await calc();});await p.waitForTimeout(500);
await p.evaluate(()=>{$('#sat').hidden=true;startNav();});await p.waitForTimeout(500);
console.log('au départ :',await p.textContent('#nLeft'),'restant pour',await p.textContent('#nKm'),'km');
let lat=5.3480; const speeds=[3.3,3.3,5,3.3,2,3.3,5,3.3,3.3,2.5,3.3,5,3.3,3.3,3.3,5,2,3.3,3.3,3.3,5,3.3,3.3,2.5,3.3,5,3.3,3.3,3.3,5,3.3,3.3,2,3.3,3.3,5,3.3,3.3,3.3,3.3,5,3.3,3.3,3.3,3.3]; // m/s ≈ 12 km/h, pointes 18
for(const v of speeds){ lat-=v/111320; await ctx.setGeolocation({latitude:lat,longitude:-4.0040}); await p.waitForTimeout(1000); }
await p.waitForTimeout(3200);
console.log('après ~45 s en accordéon : alerte =',await p.textContent('#nStatus'),'| classe',await p.getAttribute('#nStatus','class'));
console.log('temps restant affiché :',await p.textContent('#nLeft'),'pour',await p.textContent('#nKm'),'km | allure mesurée',await p.evaluate(()=>Math.round(S.nav.paceK)),'km/h, normale',await p.evaluate(()=>Math.round(S.nav.freeK)),'km/h');
console.log('errors:',e.join('|')||'none');await b.close();})();
