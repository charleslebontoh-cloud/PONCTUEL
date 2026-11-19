const {chromium}=require('playwright');
(async()=>{for (const orbisUp of [true,false]){
const b=await chromium.launch({args:['--use-gl=swiftshader','--ignore-gpu-blocklist']});
const ctx=await b.newContext({viewport:{width:400,height:820},colorScheme:'dark'});
const p=await ctx.newPage();const e=[];const tileReqs=[];p.on('pageerror',x=>e.push(x.message));
await p.addInitScript(()=>localStorage.setItem('pc_settings',JSON.stringify({key:'DEMOKEY',v3d:2})));
await p.route(/orbis\/assets\/styles/,r=>{ if(!orbisUp) return r.fulfill({status:403,body:''});
  const u=r.request().url(); if(!u.includes('0.*/style.json')) return r.fulfill({status:404,body:''});
  r.fulfill({json:{version:8,sources:{v:{type:'raster',tiles:['https://api.tomtom.com/maps/orbis/map-display/tile/{z}/{x}/{y}.png?apiVersion=1'],tileSize:256}},layers:[{id:'bg',type:'background',paint:{'background-color':'#20242c'}},{id:'v',type:'raster',source:'v'}]}});});
await p.route(/map-display\/tile/,r=>{tileReqs.push(r.request().url());r.fulfill({status:404,body:''});});
await p.route(/openfreemap\.org\/styles/,r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'ofm-bg',type:'background',paint:{'background-color':'#123'}}]}}));
await p.route(/fonts|arcgis|traffic\/map|creativeclaw/,r=>r.fulfill({status:404,body:''}));
await p.goto('http://localhost:8765/');await p.waitForTimeout(2500);
const st=await p.evaluate(()=>({first:map.getStyle().layers[0].id, orbisOk, hasRoute:!!map.getLayer('main'), sky:!!map.getSky?.()}));
console.log('orbis up:',orbisUp,JSON.stringify(st),'| tile has key:',tileReqs.length?tileReqs[0].includes('key=DEMOKEY'):'no tile req','| errors:',e.join('|')||'none');
await b.close();}})();
