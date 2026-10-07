import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {makeResultSender,resultOf} from '../src/portable-results.js';
import {score,standings} from '../src/domain.js';
test('broadcast result transaction: retries, conflict, ownership and standings',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 for(const file of ['001_football_manager.sql','003_broadcast_results.sql'])await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 await db.exec(`insert into auth.users values('${owner}'),('${other}');set role authenticated;set request.jwt.claim.sub='${owner}'`);
 const h=(await db.query("insert into fm_teams(name) values('Home') returning *")).rows[0],a=(await db.query("insert into fm_teams(name) values('Away') returning *")).rows[0];
 const c=(await db.query("insert into fm_competitions(name) values('Cup') returning *")).rows[0];
 await db.query('insert into fm_entries(competition_id,team_id) values($1,$2),($1,$3)',[c.id,h.id,a.id]);
 let m=(await db.query('insert into fm_matches(competition_id,home_id,away_id) values($1,$2,$3) returning *',[c.id,h.id,a.id])).rows[0];
 const call=(version,result)=>db.query('select fm_sync_broadcast_result($1,$2,$3) as result',[m.id,version,JSON.stringify(result)]);
 const payload={home:2,away:1,status:'finished'};const ack=(await call(1,payload)).rows[0].result;
 assert.equal(ack.version,2);assert.equal((await call(1,payload)).rows[0].result.version,2);
 await assert.rejects(call(1,{...payload,home:3}),/BROADCAST_CONFLICT/);
 await assert.rejects(call(2,{...payload,away:-1}),/Invalid broadcast/);
 m=(await db.query('select * from fm_matches where id=$1',[m.id])).rows[0];assert.deepEqual(score(m,[]),{home:2,away:1});assert.equal(standings(c,[h,a],[m],[])[0].points,3);
 await db.exec(`set request.jwt.claim.sub='${other}'`);await assert.rejects(call(2,payload),/Match not found/);
 await db.exec('set role anon');await assert.rejects(call(2,payload),/permission denied/);
 }finally{await db.close();}
});
test('durable queue: offline latest result, reload, no duplicate, conflict blocks and owner isolation',async()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};let fail=true,calls=[];
 const args={storage,report:()=>{},send:async(id,version,payload)=>{calls.push(payload);if(fail)throw Error('offline');return {version:version+1}}};
 let sender=makeResultSender(args);const initial={cloudMatchId:'m',cloudOwnerId:'u',cloudResultVersion:1,homeScore:0,awayScore:0,timer:'00:00'};initial.cloudResultBaseline=JSON.stringify(resultOf(initial));
 sender.observe('u',initial);await sender.flush('u');assert.equal(calls.length,0);
 sender.observe('u',{...initial,homeScore:1});await sender.flush('u');
 sender=makeResultSender(args);sender.observe('u',{...initial,homeScore:2,period:'FULL TIME'});fail=false;await sender.flush('u');assert.equal(calls.at(-1).home,2);await sender.flush('u');assert.equal(calls.length,2);
 sender.observe('other',{...initial,homeScore:9});await sender.flush('other');assert.equal(calls.length,2);
 sender=makeResultSender({...args,send:async()=>{throw Error('BROADCAST_CONFLICT')}});sender.observe('u',{...initial,homeScore:3});await sender.flush('u');assert.equal(JSON.parse(storage.getItem('obs-result-queue:u')).m.blocked,true);
});
