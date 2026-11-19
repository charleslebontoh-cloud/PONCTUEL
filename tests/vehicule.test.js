const {chromium}=require('playwright');const fs=require('fs');
const SP=require('path').join(__dirname,'out')+'/', FX=require('path').join(__dirname,'fixtures')+'/';
(async()=>{for (const cors of [true,false]){
const b=await chromium.launch({args:['--use-gl=swiftshader','--ignore-gpu-blocklist']});
const ctx=await b.newContext({viewport:{width:400,height:820},geolocation:{latitude:5.3480,longitude:-4.0040},permissions:['geolocation'],colorScheme:'dark'});
const p=await ctx.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
await p.addInitScript(()=>localStorage.setItem('pc_settings',JSON.stringify({vehicle:'car3d',vcolor:'#2f7bff',v3d:1})));
await p.route(/openfreemap\.org\/styles/,r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#1b2a3d'}}]}}));
await p.route(/creativeclaw/,r=>r.fulfill({body:fs.readFileSync(FX+'mockcar.png'),contentType:'image/png',headers:cors?{'access-control-allow-origin':'*'}:{}}));
await p.route(/fonts|arcgis|tomtom/,r=>r.fulfill({status:404,body:''}));
await p.goto('http://localhost:8765/');await p.waitForTimeout(1500);
console.log('cors',cors,'migrated vehicle:',await p.evaluate(()=>S.set.vehicle+' '+S.set.vcolor));
await p.click('.tabs [data-tab=settings]');await p.waitForTimeout(500);
await p.click('[data-col="#ff3b3b"]');await p.waitForTimeout(500);
await p.evaluate(()=>{S.nav={r:{}};meMode='';meLook();});await p.waitForTimeout(500);
const info=await p.evaluate(()=>{const c=document.querySelector('#map .car3d')||meEl.querySelector('canvas');if(!c)return 'no canvas';try{const d=c.getContext('2d').getImageData(128,40,1,1).data;return 'readable px '+[...d]}catch(x){return 'tainted (ok)'}});
console.log(' vehicle canvas:',info,'| settings thumb:',await p.evaluate(()=>!!document.querySelector('.vopt .car3d')), '| readable flag', await p.evaluate(()=>realCache.kaiyi?.readable));
await p.locator('.vgrid').screenshot({path:SP+'v9-grid-'+cors+'.png'});
console.log(' errors:',e.join('|')||'none');await b.close();}})();
