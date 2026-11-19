const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
await p.addInitScript(()=>{localStorage.setItem('pc_arrive',JSON.stringify('07:30'));localStorage.setItem('pc_arriveSetAt',JSON.stringify(Date.now()-20*3600e3));});
await p.route(/openfreemap|orbis|fonts|arcgis|tomtom|media\//,r=>r.fulfill({status:404,body:''}));
await p.goto('http://localhost:8765/');await p.waitForTimeout(2000);
const out=await p.evaluate(()=>{const mk=()=>({dur:1320,free:1320,hist:0,live:true});
 const r1=smartEta(mk(),new Date(2026,10,19,7,55)); const r2=smartEta(mk(),new Date(2026,10,19,23,0)); const r3=smartEta({dur:3000,free:1320,hist:0,live:true},new Date(2026,10,19,7,55));
 // apprentissage : 2 trajets réels 15 % plus longs que prévu à 7 h
 for(let i=0;i<2;i++) learnEta({pred:2580,predAt:new Date(2026,10,19,7,10),movedAt:Date.now()-2967*1000,start:Date.now()-3000*1000});
 const r4=smartEta(mk(),new Date(2026,10,20,7,40));
 return {pointe:Math.round(r1.dur/60)+' min ('+r1.etaWhy+')',nuit:Math.round(r2.dur/60)+' min',live_plus_lent:Math.round(r3.dur/60)+' min ('+r3.etaWhy+')',apres_apprentissage:Math.round(r4.dur/60)+' min ('+r4.etaWhy+')',arrive_oubliee_effacee:arriveIn.value===''};});
console.log(JSON.stringify(out,null,1)); console.log('errors:',e.join('|')||'none'); await b.close();})();
