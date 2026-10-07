import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { matchPatch, assertCanLink } from '../src/portable-data.js';
const fixture={id:'m1',competition_id:'c1',home_id:'h',away_id:'a',status:'scheduled'};
const teams=['h','a'].map(id=>({id,name:id==='h'?'Home Test':'Away Test',home_color:'#112233',away_color:'#aabbcc',logo_path:''}));
const players=Array.from({length:13},(_,i)=>({id:'p'+i,team_id:'h',name:'Player '+i,number:String(i),active:true}));
const lineup=[{match_id:'m1',team_id:'h',player_id:'p0',role:'starter'}];
const mapped=matchPatch(fixture,teams,players,lineup,{},{});
assert.equal(mapped.homePlayers[1].status,'unselected');
for(const key of ['timer','timerRunning','homeScore','awayScore','eventHistory','period'])assert.equal(key in mapped,false);
assert.throws(()=>assertCanLink({timerRunning:true},'m1'));
assert.throws(()=>assertCanLink({homeScore:1},'m1'));
let state={timer:'00:00',timerRunning:false,homeScore:0,awayScore:0,showTopDisplay:true},writes=[];
const base=path.resolve('../portable-cloud');
const server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/state')){if(req.method==='POST'){let b='';for await(const part of req)b+=part;const patch=JSON.parse(b);writes.push(patch);Object.assign(state,patch);}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(state));return;}
  const file=path.join(base,new URL(req.url,'http://localhost').pathname);if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});const context=await browser.newContext();
await context.route('https://ascxzymhwswfwpjwzcdx.supabase.co/**',async route=>{
  const u=new URL(route.request().url());let data;
  if(u.pathname.startsWith('/auth/')){const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:'u',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.sig';data={access_token:token,refresh_token:'fake',expires_in:3600,token_type:'bearer',user:{id:'u',email:'test@example.com'}};}
  else {data={fm_matches:[fixture],fm_teams:teams,fm_players:players,fm_lineups:lineup,fm_competitions:[{id:'c1',name:'Test Cup'}]}[u.pathname.split('/').pop()]||[];}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(origin+'/control.html');await page.evaluate(()=>setControlTab('setup'));
await page.locator('#cloud-panel input[type=email]').fill('test@example.com');await page.locator('#cloud-panel input[type=password]').fill('test-password');await page.locator('#cloud-panel button[type=submit]').click();await page.locator('#cloud-match').selectOption('m1');await page.getByRole('button',{name:'ดึงทีมและนักเตะนัดที่เลือก'}).click();await page.waitForFunction(()=>document.querySelector('#cloud-status').textContent.startsWith('ดึงข้อมูลแล้ว'));
assert.equal(state.homeName,'Home Test');assert.equal(state.homePlayers.length,13);assert.equal(state.showTopDisplay,true);assert.equal(state.timer,'00:00');
assert.equal(await page.locator('#home-name').isVisible(),false);
state.homeScore=2;state.timer='25:30';state.eventHistory=[{kind:'goal'}];
await page.getByRole('button',{name:'ดึงทีมและนักเตะนัดที่เลือก'}).click();await page.waitForFunction(()=>document.querySelector('#cloud-status').textContent.startsWith('ดึงข้อมูลแล้ว'));
assert.equal(state.homeScore,2);assert.equal(state.timer,'25:30');assert.equal(state.eventHistory.length,1);
const roster=await context.newPage();roster.on('pageerror',e=>errors.push(e.message));await roster.goto(origin+'/cloud-lineup.html');await roster.locator('select[data-id=p1]').selectOption('substitute');await roster.getByRole('button',{name:'ใช้รายชื่อและชุดแข่งใน OBS'}).click();await roster.waitForFunction(()=>document.querySelector('#cloud-status').textContent.startsWith('ใช้รายชื่อใน OBS แล้ว'));assert.equal(state.homePlayers[1].status,'substitute');assert.equal(state.homeScore,2);
for(let i=0;i<12;i++)await roster.locator(`select[data-id=p${i}]`).selectOption('starter');await roster.getByRole('button',{name:'ใช้รายชื่อและชุดแข่งใน OBS'}).click();await roster.waitForFunction(()=>document.querySelector('#cloud-status').textContent.includes('สูงสุด 11'));
await roster.setViewportSize({width:390,height:844});assert.equal(await roster.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await context.setOffline(true);await page.evaluate(()=>setControlTab('live'));assert.equal(await page.locator('#home-score').inputValue(),'2');
assert.deepEqual(errors,[]);console.log('PASS: cloud login/import, selected roster, repeated pull preserves live state, max 11, mobile and cached offline UI');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
