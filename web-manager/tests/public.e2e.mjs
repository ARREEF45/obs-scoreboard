import fs from 'node:fs';
import assert from 'node:assert/strict';
import {preview} from 'vite';
import {chromium} from 'playwright-core';
const server=await preview({preview:{host:'127.0.0.1',port:4179,strictPort:true}});let browser;
try{
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const data={competition:{id:'c',name:'Test Cup',win_points:3,draw_points:1,loss_points:0},teams:[{id:'h',name:'Home Team',coach:'Coach',home_color:'#112233',away_color:'#445566'},{id:'a',name:'Away Team'}],players:[{id:'p',team_id:'h',name:'Striker',number:'9',active:true,position:'ST'}],matches:[{id:'m',competition_id:'c',home_id:'h',away_id:'a',status:'finished',round:1,obs_home_score:3,obs_away_score:2,obs_result:{source:'manual'}}],lineups:[{match_id:'m',team_id:'h',player_id:'p',role:'starter'}],events:[{id:'e',match_id:'m',team_id:'h',player_id:'p',kind:'goal',minute:10}]};
 let published=true;
 await page.route('https://ascxzymhwswfwpjwzcdx.supabase.co/**',async route=>{
   const url=new URL(route.request().url());assert.match(url.pathname,/\/rpc\/fm_public_competitions?$/);
   const payload=url.pathname.endsWith('fm_public_competitions')?[{id:'c',name:'Test Cup'}]:published?data:null;
   await route.fulfill({contentType:'application/json',body:JSON.stringify(payload)});
 });
 await page.goto('http://127.0.0.1:4179/public.html');await page.getByRole('heading',{name:'Test Cup',exact:true}).waitFor();assert.equal(await page.locator('input[type=password]').count(),0);assert.match(await page.locator('#public-content').textContent(),/3 : 2/);
 await page.locator('[data-tab=standings]').click();assert.match(await page.locator('tbody').textContent(),/Home Team/);
 await page.locator('[data-tab=teams]').click();assert.match(await page.locator('#public-content').textContent(),/Striker/);
 await page.locator('[data-tab=stats]').click();assert.equal(await page.locator('tbody tr td').nth(2).textContent(),'1');
 await page.locator('[data-tab=matches]').click();await page.locator('[data-match=m]').click();assert.match(await page.locator('#public-content').textContent(),/Striker/);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/public-mobile.png',fullPage:true});
 published=false;await page.locator('#public-refresh').click();await page.waitForFunction(()=>document.querySelector('#public-content').textContent.includes('ยังไม่มีรายการ'));assert.equal(await page.locator('#public-content').textContent().then(s=>s.includes('Striker')),false);
 assert.deepEqual(errors,[]);console.log('PASS: public visitor without login, fixtures/results, table, team roster, statistics, match details, mobile and unpublish');
}finally{await browser?.close();await new Promise(r=>server.httpServer.close(r));}
