const {chromium}=require('playwright');
const SP=require('path').join(__dirname,'out')+'/', FX=require('path').join(__dirname,'fixtures')+'/';
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--ignore-gpu-blocklist']});
for (const mode of ['local','claude']){
const ctx=await b.newContext({viewport:{width:400,height:820},geolocation:{latitude:5.3480,longitude:-4.0040},permissions:['geolocation'],colorScheme:'dark'});
const p=await ctx.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
await p.addInitScript(m=>localStorage.setItem('pc_settings',JSON.stringify({key:'DEMO',v3d:2,buffer:10,voice:false,aiKey:m==='claude'?'sk-ant-test':''})),mode);
await p.route(/openfreemap\.org\/styles|orbis/,r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#1b2a3d'}}]}}));
await p.route(/fonts|arcgis|traffic\/map|flowSegment/,r=>r.fulfill({status:404,body:''}));
await p.route(/search\/2\/search|photon/,r=>{const q=decodeURIComponent(r.request().url());const n=/bhci/i.test(q)?'Siège BHCI':/plateau/i.test(q)?'Plateau':'Lieu';r.fulfill({json:{results:[{position:{lat:5.3215,lon:-4.017},poi:{name:n},address:{freeformAddress:n+', Abidjan'}}]}})});
await p.route(/calculateRoute/,r=>r.fulfill({json:{routes:[{summary:{lengthInMeters:9000,travelTimeInSeconds:1500,trafficDelayInSeconds:420},legs:[{points:[{latitude:5.348,longitude:-4.004},{latitude:5.335,longitude:-4.01},{latitude:5.3215,longitude:-4.017}]}],sections:[{sectionType:'TRAFFIC',startPointIndex:0,endPointIndex:1,delayInSeconds:300,effectiveSpeedInKmh:9,magnitudeOfDelay:3}],guidance:{instructions:[]}}]}}));
let turn=0; const bodies=[];
await p.route(/api\.anthropic\.com\/v1\/messages/,async r=>{const body=JSON.parse(r.request().postData()); bodies.push(body); turn++;
  const H={'content-type':'application/json','access-control-allow-origin':'*'};
  if(turn===1) return r.fulfill({headers:H,json:{id:'m1',type:'message',role:'assistant',model:'claude-opus-5-5',stop_reason:'tool_use',content:[{type:'text',text:'Je programme ça.'},{type:'tool_use',id:'tu1',name:'set_alarm',input:{destination:'BHCI',arrive_time:'07:30'}}],usage:{input_tokens:1,output_tokens:1}}});
  return r.fulfill({headers:H,json:{id:'m2',type:'message',role:'assistant',model:'claude-opus-5-5',stop_reason:'end_turn',content:[{type:'text',text:'C’est fait : réveil pour la **BHCI** à 7 h 30, départ vers 06:45.'}],usage:{input_tokens:1,output_tokens:1}}});});
await p.goto('http://localhost:8765/');await p.waitForTimeout(2600);
await p.click('#skipSplash').catch(()=>{});await p.waitForTimeout(500);
await p.click('#bAI');await p.waitForTimeout(500);
const ask=async q=>{await p.fill('#aiIn',q);await p.click('.aisend');await p.waitForTimeout(2500);return (await p.$$eval('.msg.ai',n=>n.at(-1).innerText)).replace(/\s+/g,' ').slice(0,170);};
if(mode==='local'){
 console.log('BRIEF:', (await p.$$eval('.msg.card',n=>n[0].innerText)).replace(/\s+/g,' ').slice(0,120));
 console.log('1', await ask('Réveille-moi demain pour être à la BHCI à 7h30'));
 console.log('2', await ask('Combien de temps pour aller au Plateau ?'));
 console.log('3', await ask('Je dois être au Plateau à 9h'));
 console.log('4', await ask('Comment est le trafic ?'));
 console.log('5', await ask('Signale un bouchon'));
 console.log('6', await ask('Suis-je souvent en retard ?'));
 console.log('alarms:', await p.evaluate(()=>alarms.map(a=>a.dest.name+' '+a.time+' '+a.date).join('|')),'arriveIn:',await p.evaluate(()=>arriveIn.value));
 await p.screenshot({path:SP+'v16-ai-local.png'});
} else {
 console.log('C', await ask('Je dois être à la BHCI demain à 7h30, réveille-moi'));
 console.log('claude calls:',turn,'| model:',bodies[0].model,'| tools:',bodies[0].tools.length,'| fallbacks:',bodies[0].fallbacks,'| 2nd has tool_result:',JSON.stringify(bodies[1]?.messages.at(-1).content[0]).slice(0,90));
 console.log('mode label:',await p.textContent('#aiMode'),'| alarms:',await p.evaluate(()=>alarms.length));
 await p.screenshot({path:SP+'v16-ai-claude.png'});
}
console.log('errors:',e.join('|')||'none');await ctx.close();}
await b.close();})();
