const {chromium}=require('playwright');const fs=require('fs');
const SP=require('path').join(__dirname,'out')+'/', FX=require('path').join(__dirname,'fixtures')+'/';
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--ignore-gpu-blocklist']});
for (const orb of ['fail','driving-fail']){
const p=await b.newPage({viewport:{width:400,height:820}});const e=[];p.on('pageerror',x=>e.push(x.message));
await p.addInitScript(o=>localStorage.setItem('pc_settings',JSON.stringify({key:'DEMO',v3d:2,three:true})),orb);
const png=fs.readFileSync(FX+'mocklogo.png');
await p.route(/openfreemap\.org\/styles/,r=>r.fulfill({json:{version:8,sources:{openmaptiles:{type:'vector',tiles:['https://mock.vt/{z}/{x}/{y}.pbf'],maxzoom:14}},layers:[{id:'background',type:'background',paint:{'background-color':'#eee'}},{id:'landcover_wood',type:'fill',source:'openmaptiles','source-layer':'landcover',paint:{'fill-color':'#0f0'}},{id:'highway_primary',type:'line',source:'openmaptiles','source-layer':'transportation',paint:{'line-color':'#fff'}},{id:'building-3d',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',paint:{}},{id:'poi',type:'symbol',source:'openmaptiles','source-layer':'poi',layout:{}}]}}));
let orbisCalls=[];await p.route(/orbis\/assets\/styles/,r=>{const u=r.request().url();orbisCalls.push(u.match(/map=([^&]+)/)[1]);
  if(orb==='fail') return r.fulfill({status:500,body:''});
  if(/driving/.test(u)) return r.fulfill({status:404,body:''});
  r.fulfill({json:{version:8,sources:{},layers:[{id:'orbis-bg',type:'background',paint:{'background-color':'#123'}}]}});});
await p.route(/mock\.vt|arcgisonline|elevation-tiles|fonts|traffic\/map|media\//,r=>r.fulfill({status:404,body:''}));
await p.goto('http://localhost:8765/');await p.waitForTimeout(3000);
const st=await p.evaluate(()=>({base:S.base,label:document.querySelector('#bLayerLbl').textContent,layers:map.getStyle().layers.map(l=>l.id).slice(0,6).join(','),terrain:!!map.getTerrain(),b3d:!!map.getLayer('b3d')}));
console.log(orb,'REAL:',JSON.stringify(st));
await p.click('#skipSplash').catch(()=>{});await p.click('#bLayer');await p.waitForTimeout(1500);
console.log(orb,'PLAN:',await p.evaluate(()=>JSON.stringify({base:S.base,first:map.getStyle().layers[0].id,terrain:!!map.getTerrain(),orbisOk})),'orbis calls:',orbisCalls.join(','));
if(orb==='driving-fail'){ await p.evaluate(()=>{S.nav={r:{coords:[]}};}); const r=await p.evaluate(async()=>{const st=await styleFor('plan');return st.layers[0].id}); console.log('nav driving→fallback normal:',r,'calls:',orbisCalls.slice(-2).join(','));}
console.log('errors:',e.join('|')||'none');await p.close();}
await b.close();})();
