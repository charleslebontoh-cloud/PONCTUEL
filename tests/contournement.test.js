const {chromium}=require('playwright');
const SP=require('path').join(__dirname,'out')+'/', FX=require('path').join(__dirname,'fixtures')+'/';
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--ignore-gpu-blocklist']});
const ctx=await b.newContext({viewport:{width:400,height:820},geolocation:{latitude:5.3480,longitude:-4.0040},permissions:['geolocation']});
const p=await ctx.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
await p.addInitScript(()=>localStorage.setItem('pc_settings',JSON.stringify({key:'DEMO',v3d:2,voice:false})));
await p.route(/openfreemap|orbis|fonts|arcgis|traffic\/map|media\/|elevation/,r=>r.fulfill({status:404,body:''}));
await p.route(/flowSegmentData/,r=>{const lat=+decodeURIComponent(r.request().url()).match(/point=([\d.\-]+)/)[1];const slow=lat<5.343&&lat>5.336;
 r.fulfill({json:{flowSegmentData:{currentSpeed:slow?6:38,freeFlowSpeed:40,confidence:.9,roadClosure:false}}});});
let posts=0,gets=0;
await p.route(/calculateRoute/,r=>{const isPost=r.request().method()==='POST';isPost?posts++:gets++;
 const u=r.request().url();const m=u.match(/calculateRoute\/([\d.\-]+),([\d.\-]+):/);const la=+m[1],lo=+m[2];
 const pts=[];const N=40;for(let i=0;i<=N;i++){const f=i/N;const bow=isPost?0.006*Math.sin(f*Math.PI):0;pts.push({latitude:la+(5.3215-la)*f,longitude:lo+(-4.017-lo)*f+bow});}
 const tt=isPost?650:600; r.fulfill({json:{routes:[{summary:{lengthInMeters:isPost?4600:4000,travelTimeInSeconds:tt,trafficDelayInSeconds:0,noTrafficTravelTimeInSeconds:tt},legs:[{points:pts}],sections:[],guidance:{instructions:[]}}]}});});
await p.goto('http://localhost:8765/');await p.waitForTimeout(2500);await p.click('#skipSplash').catch(()=>{});
await p.evaluate(async()=>{setB({lat:5.3215,lng:-4.017,name:'BHCI'});await calc();});await p.waitForTimeout(500);
await p.evaluate(()=>{$('#sat').hidden=true;startNav();});
let t0=Date.now(); while(Date.now()-t0<15000){ if(await p.isVisible('#nOffer')) break; await p.waitForTimeout(250);}
console.log('proposition affichée après',((Date.now()-t0)/1000).toFixed(1),'s :',await p.isVisible('#nOffer') && (await p.textContent('#nOffer')).replace(/\s+/g,' '),'| requêtes contournement (POST):',posts);
await p.screenshot({path:SP+'v23-offer.png'});
await p.waitForTimeout(10800);
console.log('acceptée seule :', await p.isHidden('#nOffer'), '| nouvel itinéraire contourne :', await p.evaluate(()=>S.nav.r.dist===4600));
// recalcul express après sortie de route
const g0=gets, tR=Date.now(); await ctx.setGeolocation({latitude:5.3445,longitude:-4.0120}); await p.waitForTimeout(1100); await ctx.setGeolocation({latitude:5.3440,longitude:-4.0125});
while(Date.now()-tR<8000){ if(await p.evaluate(()=>Math.abs(S.nav.r.coords[0][0]-5.344)<0.001)) break; await p.waitForTimeout(150);} 
console.log('recalcul après sortie de route en',((Date.now()-tR)/1000).toFixed(1),'s');
console.log('errors:',e.join('|')||'none');await b.close();})();
