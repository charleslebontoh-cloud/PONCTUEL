const {chromium}=require('playwright');
const SP=require('path').join(__dirname,'out')+'/', FX=require('path').join(__dirname,'fixtures')+'/';
const zlib=require('zlib');
// tuile PNG 256 unie (couleur passée) pour simuler les fonds
function png(r,g,b){const w=256,h=256,raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;for(let x=0;x<w;x++){const o=y*(w*3+1)+1+x*3;const grid=(x%64<2||y%64<2)?30:0;raw[o]=r-grid;raw[o+1]=g-grid;raw[o+2]=b-grid;}}
const crc=(buf)=>{let c,crc=0xffffffff;for(let n=0;n<buf.length;n++){c=(crc^buf[n])&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return (crc^0xffffffff)>>>0;};
const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;
return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const base=png(28,40,58), sat=png(60,80,50);
(async()=>{
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const ctx=await b.newContext({viewport:{width:400,height:820},geolocation:{latitude:5.3480,longitude:-4.0040},permissions:['geolocation'],colorScheme:'dark'});
const p=await ctx.newPage(); const errs=[];
p.on('pageerror',e=>errs.push('ERR '+e.message)); p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push('console '+m.text())});
await p.route(/fonts\.(googleapis|gstatic)|openfreemap\.org\/fonts/,r=>r.fulfill({status:404,body:''}));
await p.route(/openfreemap\.org\/styles/,r=>r.fulfill({json:{version:8,sources:{t:{type:'raster',tiles:['https://mock.tiles/{z}/{x}/{y}.png'],tileSize:256}},layers:[{id:'bg',type:'background',paint:{'background-color':'#0b1220'}},{id:'t',type:'raster',source:'t'}]}}));
await p.route(/mock\.tiles|tile\.openstreetmap|Canvas/,r=>r.fulfill({body:base,contentType:'image/png'}));
await p.route(/arcgisonline|gibs/,r=>r.fulfill({body:sat,contentType:'image/png'}));
await p.route(/traffic\/map/,r=>r.fulfill({status:404,body:''}));
await p.route(/api\.tomtom\.com\/search\/2\/search/,r=>r.fulfill({json:{results:[{position:{lat:5.3215,lon:-4.0170},poi:{name:'Plateau – Tour BHCI'},address:{freeformAddress:'Avenue Joseph Anoma, Plateau, Abidjan'}}]}}));
await p.route(/flowSegmentData/,r=>r.fulfill({json:{flowSegmentData:{currentSpeed:9,freeFlowSpeed:40,currentTravelTime:300,freeFlowTravelTime:70,roadClosure:false,coordinates:{coordinate:[{latitude:5.3205,longitude:-4.0185},{latitude:5.3220,longitude:-4.0160}]}}}}));
await p.route(/calculateRoute/,r=>{
  const mk=(n,off)=>{const pts=[];for(let i=0;i<=n;i++)pts.push({latitude:5.348-(0.0265*i/n)+off*Math.sin(i/n*Math.PI),longitude:-4.004-(0.013*i/n)});return pts;};
  const route=(off,tt,delay,secs)=>({summary:{lengthInMeters:4200+off*1e5,travelTimeInSeconds:tt,trafficDelayInSeconds:delay,noTrafficTravelTimeInSeconds:tt-delay},legs:[{points:mk(60,off)}],sections:secs,
   guidance:{instructions:[{message:'Partez vers le sud',routeOffsetInMeters:0,point:{latitude:5.348,longitude:-4.004},maneuver:'DEPART'},{message:'Tournez à droite sur le Boulevard Lagunaire',routeOffsetInMeters:1500,point:{latitude:5.34,longitude:-4.008},maneuver:'TURN_RIGHT'},{message:'Au rond-point, prenez la 2e sortie',routeOffsetInMeters:1750,point:{latitude:5.338,longitude:-4.009},maneuver:'ROUNDABOUT_RIGHT'},{message:'Vous êtes arrivé',routeOffsetInMeters:4200,point:{latitude:5.3215,longitude:-4.017},maneuver:'ARRIVE'}]}});
  r.fulfill({json:{routes:[route(0,1500,600,[{sectionType:'TRAFFIC',startPointIndex:20,endPointIndex:30,delayInSeconds:420,effectiveSpeedInKmh:8,magnitudeOfDelay:3}]),route(0.004,1260,120,[{sectionType:'TRAFFIC',startPointIndex:40,endPointIndex:44,delayInSeconds:90,effectiveSpeedInKmh:20,magnitudeOfDelay:2}])]}});
});
await p.goto('http://localhost:8765/'); await p.waitForTimeout(300); await p.screenshot({path:SP+'v18-0-splash.png'}); console.log('splash present:', await p.isVisible('#splash'));
await p.waitForTimeout(2500);
console.log('webgl canvas:', await p.evaluate(()=>!!document.querySelector('#map canvas')), 'style ok:', await p.evaluate(()=>map.isStyleLoaded()));
await p.click('#bLocate'); await p.waitForTimeout(1500);
await p.screenshot({path:SP+'v18-1-accueil.png'});
await p.click('.tabs [data-tab=settings]'); await p.waitForTimeout(400);
await p.click('[data-veh=taxi]'); await p.waitForTimeout(300);
await p.screenshot({path:SP+'v18-2-reglages.png'});
await p.fill('#sKey','DEMO'); await p.click('#sSaveKey'); await p.waitForTimeout(600);
await p.evaluate(()=>{const d=new Date(Date.now()+40*60000);const i=document.querySelector('#arriveAt');i.value=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');i.dispatchEvent(new Event('change'));});
await p.fill('#inB','Plateau'); await p.waitForTimeout(900);
await p.click('#suggest button[data-i="0"]'); await p.waitForTimeout(3000);
await p.screenshot({path:SP+'v18-3-itineraires.png'});
await p.waitForTimeout(2000); console.log('sat:',await p.isVisible('#sat'), await p.textContent('#satTitle'), await p.evaluate(()=>({src:!!satMap?.getSource('jam'),loaded:satMap?.loaded(),list:satList().length})));
await p.click('#satClose'); await p.click('#grab'); await p.waitForTimeout(400); await p.click('#grab'); await p.waitForTimeout(400); await p.screenshot({path:SP+'v18-3b-trajet.png'});
await p.click('#startNav'); await p.waitForTimeout(1500);
for (const [la,lo] of [[5.3440,-4.0060],[5.3415,-4.0072],[5.3400,-4.0081]]){ await ctx.setGeolocation({latitude:la,longitude:lo}); await p.waitForTimeout(1100); }
await p.waitForTimeout(800);
await p.screenshot({path:SP+'v18-4-guidage.png'});
console.log('nav:',await p.textContent('#nDist'),'|',await p.textContent('#nMsg'),'| compass',await p.textContent('#compassLbl'),'| bearing',await p.evaluate(()=>Math.round(map.getBearing())),'pitch',await p.evaluate(()=>Math.round(map.getPitch())));
await p.screenshot({path:SP+'v18-nav.png'}); console.log('clean UI: fab hidden', await p.evaluate(()=>getComputedStyle(document.querySelector('#fab')).opacity), 'lstack', await p.evaluate(()=>getComputedStyle(document.querySelector('#lstack')).opacity)); await p.mouse.click(200,560); await p.waitForTimeout(500); console.log('peek shows fab:', await p.evaluate(()=>getComputedStyle(document.querySelector('#fab')).opacity)); await p.screenshot({path:SP+'v18-peek.png'}); await p.click('#nMore'); await p.waitForTimeout(300); await p.screenshot({path:SP+'v18-tray.png'}); await p.click('#nRep'); await p.waitForTimeout(400); await p.screenshot({path:SP+'v18-r-report.png'}); await p.click('[data-rk=police]'); await p.waitForTimeout(500); console.log('reports saved:', await p.evaluate(()=>reports.length), 'pins:', await p.evaluate(()=>document.querySelectorAll('.rpin').length)); await ctx.grantPermissions(['clipboard-read','clipboard-write']); await p.click('#nMore'); await p.waitForTimeout(200); await p.click('#nShare'); await p.waitForTimeout(400); console.log('share toast:', await p.textContent('#toast'));
// déplacer la carte -> bouton recentrer
const box=await p.locator('#map').boundingBox(); await p.mouse.move(200,500); await p.mouse.down(); await p.mouse.move(260,420,{steps:8}); await p.mouse.up(); await p.waitForTimeout(400);
console.log('recenter visible:',await p.isVisible('#recenter'));
await p.screenshot({path:SP+'v18-5-recentrer.png'});
await p.click('#recenter'); await p.waitForTimeout(1000); console.log('recenter hidden after click:',await p.isHidden('#recenter'));
await ctx.setGeolocation({latitude:5.3216,longitude:-4.0170}); await p.waitForTimeout(1500);
console.log('arrived:',await p.isHidden('#navbar')); console.log('journal enregistré :', await p.evaluate(()=>{const l=JSON.parse(localStorage.getItem('pc_navlogs')||'[]');return l.length+' trajet(s), '+(l[0]?.log||[]).length+' événement(s)'})); await p.waitForTimeout(900); console.log('arrival card:', await p.isVisible('#arrival'), await p.textContent('#arrival h2')); await p.screenshot({path:SP+'v18-6-arrivee.png'}); await p.click('#arrOk'); await p.waitForTimeout(300); console.log('recents:', await p.evaluate(()=>recents.map(r=>r.name).join(',')), 'theme:', await p.evaluate(()=>document.documentElement.dataset.theme), 'splash gone:', await p.evaluate(()=>!document.querySelector('#splash')));
console.log(errs.join('\n')||'no errors');
await b.close();})();
