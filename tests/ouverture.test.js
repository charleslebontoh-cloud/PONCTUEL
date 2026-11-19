const {chromium}=require('playwright');const fs=require('fs');
const SP=require('path').join(__dirname,'out')+'/', FX=require('path').join(__dirname,'fixtures')+'/';
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
for (const vidOk of [false,true]){
const p=await b.newPage({viewport:{width:400,height:820}});const e=[];p.on('pageerror',x=>e.push(x.message));
await p.route(/intro\.mp4/,r=>vidOk?r.fulfill({body:fs.readFileSync(FX+'test.webm'),contentType:'video/webm'}):r.fulfill({status:404,body:''}));
await p.route(/media\/logo|media\/icon/,r=>r.fulfill({body:fs.readFileSync(FX+'mocklogo.png'),contentType:'image/png'}));
await p.route(/openfreemap\.org\/styles|orbis/,r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#1b2a3d'}}]}}));
await p.route(/fonts|arcgis|tomtom/,r=>r.fulfill({status:404,body:''}));
const t0=Date.now(); await p.goto('http://localhost:8765/');
await p.waitForTimeout(1500); const state=await p.evaluate(()=>({vid:!!document.querySelector('#splashVid'),on:document.querySelector('#splashVid')?.classList.contains('on')}));
let gone=0; for(let i=0;i<40;i++){ if(await p.evaluate(()=>!document.querySelector('#splash'))){gone=Date.now()-t0;break;} await p.waitForTimeout(250);}
console.log('video ok:',vidOk,JSON.stringify(state),'splash closed after ~',Math.round(gone/100)/10,'s','| errors:',e.join('|')||'none');
await p.close();}
// bouton Passer
const p=await b.newPage({viewport:{width:400,height:820}});await p.route(/creativeclaw|fonts|arcgis|tomtom|openfreemap/,r=>r.fulfill({status:404,body:''}));
await p.goto('http://localhost:8765/');await p.waitForTimeout(500);await p.click('#skipSplash');await p.waitForTimeout(800);console.log('skip works:',await p.evaluate(()=>!document.querySelector('#splash')));
await b.close();})();
