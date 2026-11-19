const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--ignore-gpu-blocklist']});
const ctx=await b.newContext({viewport:{width:400,height:820},geolocation:{latitude:5.3480,longitude:-4.0040},permissions:['geolocation']});
const p=await ctx.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
await p.addInitScript(()=>localStorage.setItem('pc_settings',JSON.stringify({key:'DEMO',v3d:2,voice:false})));
await p.route(/openfreemap|orbis|fonts|arcgis|traffic\/map|media\/|elevation/,r=>r.fulfill({status:404,body:''}));
let probes=0;await p.route(/flowSegmentData/,r=>{probes++;const lat=+decodeURIComponent(r.request().url()).match(/point=([\d.\-]+)/)[1];
 const slow=lat<5.343&&lat>5.338; r.fulfill({json:{flowSegmentData:{currentSpeed:slow?8:38,freeFlowSpeed:40,confidence:.9,roadClosure:false}}});});
await p.route(/calculateRoute/,r=>{const pts=[];for(let i=0;i<=40;i++)pts.push({latitude:5.348+(5.3215-5.348)*i/40,longitude:-4.004+(-4.017+4.004)*i/40});
 r.fulfill({json:{routes:[{summary:{lengthInMeters:4000,travelTimeInSeconds:600,trafficDelayInSeconds:0,noTrafficTravelTimeInSeconds:600},legs:[{points:pts}],sections:[],guidance:{instructions:[]}}]}});});
await p.goto('http://localhost:8765/');await p.waitForTimeout(2500);await p.click('#skipSplash').catch(()=>{});
console.log('version affichée :', await p.evaluate(()=>{showTab('settings');return [...document.querySelectorAll('#pane .empty')].map(x=>x.textContent).find(t=>/Version/.test(t))}));
await p.evaluate(async()=>{setB({lat:5.3215,lng:-4.017,name:'BHCI'});await calc();});await p.waitForTimeout(600);
await p.evaluate(()=>{$('#sat').hidden=true;startNav();});await p.waitForTimeout(7000);
console.log('sondes TomTom envoyées :',probes,'| alerte :',await p.textContent('#nStatus'),'| classe :',await p.getAttribute('#nStatus','class'));
// démarrage directement dans un bouchon : jamais roulé > 8 km/h
await p.evaluate(()=>{S.nav.start=Date.now()-120000; S.nav.movedAt=null; S.nav.probes=[]; S.nav.slowSince=Date.now()-90000; S.posT=Date.now()-10000;});await p.waitForTimeout(3500);
console.log('démarrage dans le bouchon :',await p.textContent('#nStatus'),'| recherche lancée :',await p.evaluate(()=>S.nav.crawlAsked===1));
console.log('errors:',e.join('|')||'none');await b.close();})();
