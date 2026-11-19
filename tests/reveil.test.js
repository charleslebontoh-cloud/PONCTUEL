const {chromium}=require('playwright');
const SP=require('path').join(__dirname,'out')+'/', FX=require('path').join(__dirname,'fixtures')+'/';
(async()=>{
const b=await chromium.launch({args:['--use-gl=swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:400,height:820},geolocation:{latitude:5.3480,longitude:-4.0040},permissions:['geolocation'],colorScheme:'dark'});
const p=await ctx.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
const urls=[];
await p.addInitScript(()=>localStorage.setItem('pc_settings',JSON.stringify({key:'DEMO',v3d:2,buffer:10})));
await p.route(/openfreemap\.org\/styles|orbis\/assets/,r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#1b2a3d'}}]}}));
await p.route(/fonts|arcgis|traffic\/map|creativeclaw|search\/2/,r=>r.fulfill({status:404,body:''}));
await p.route(/calculateRoute/,r=>{urls.push(r.request().url());r.fulfill({json:{routes:[{summary:{lengthInMeters:9000,travelTimeInSeconds:1500,trafficDelayInSeconds:420},legs:[{points:[{latitude:5.348,longitude:-4.004},{latitude:5.32,longitude:-4.017}]}],sections:[]}]}});});
await p.goto('http://localhost:8765/');await p.waitForTimeout(2500);
// une destination récente
await p.evaluate(()=>{setB({lat:5.3215,lng:-4.0170,name:'Siège BHCI'});});
await p.click('.tabs [data-tab=alarm]');await p.waitForTimeout(400);
await p.screenshot({path:SP+'v12-1-form.png'});
// heure d'arrivée dans 40 min aujourd'hui, pré-alerte 15 min -> pré-alerte immédiate (départ dans ~5 min)
const t=await p.evaluate(()=>{const d=new Date(Date.now()+40*60000);return [String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'), ymd(d)];});
await p.fill('#fTime',t[0]); await p.fill('#fDate',t[1]); await p.selectOption('#fPrep','15'); await p.selectOption('#fFrom','gps');
await p.click('#fSave'); await p.waitForTimeout(2500);
const st=await p.evaluate(()=>{const a=alarms[0];return {leave:a.occ?.leave&&fmtTime(new Date(a.occ.leave)),dur:a.occ?.dur,src:a.occ?.src,pre:a.occ?.pre,main:a.occ?.main,err:a.occ?.err}});
console.log('alarm state:',JSON.stringify(st),'| live call:',urls.some(u=>u.includes('departAt=now')),'| overlay:',await p.isVisible('#alarm'), await p.textContent('#alKind'));
await p.screenshot({path:SP+'v12-2-prealert.png'});
await p.click('#alStop'); await p.waitForTimeout(300);
// réveil demain matin 7h30 -> appel « prévu » avec arriveAt
await p.click('[data-fday="1"]'); await p.click('[data-fday="2"]'); await p.fill('#fTime','07:30'); await p.click('#fSave'); await p.waitForTimeout(2500);
console.log('weekday alarm:', await p.evaluate(()=>JSON.stringify({days:alarms[1].days, leave:alarms[1].occ?.leave&&new Date(alarms[1].occ.leave).toString().slice(0,21), src:alarms[1].occ?.src})), '| arriveAt call:', urls.some(u=>u.includes('arriveAt=')));
console.log('ics ok:', await p.evaluate(()=>{const x=icsFor(alarms[1]);return x.includes('BEGIN:VALARM')&&x.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,TU')}));
console.log('pill:', await p.textContent('#alarmPill'));
await p.screenshot({path:SP+'v12-3-liste.png'});
await p.click('#bsOn'); await p.waitForTimeout(400); await p.screenshot({path:SP+'v12-4-chevet.png'}); console.log('bedside:', await p.textContent('#bsNext')); await p.click('#bsExit');
await p.click('[data-arun]'); await p.waitForTimeout(800); console.log('test alarm:', await p.isVisible('#alarm'), 'audio playing:', await p.evaluate(()=>alarmAudio&&!alarmAudio.paused&&!alarmAudio.muted));
await p.screenshot({path:SP+'v12-5-alarme.png'});
await p.click('#alSnooze'); console.log('snooze set:', await p.evaluate(()=>!!alarms[0].occ.snooze));
console.log('errors:',e.join('|')||'none'); await b.close();})();
