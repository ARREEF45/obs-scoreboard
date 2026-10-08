import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {score,standings} from '../src/domain.js';
import {broadcastEventsHTML,emptyEventsHTML} from '../src/broadcast-events.js';
test('public RPC exposes only published sports data; manual results affect standings; anonymous writes denied',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 for(const file of ['001_football_manager.sql','003_broadcast_results.sql','004_public_competitions.sql'])await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 await db.exec(`insert into auth.users values('${owner}'),('${other}');set role authenticated;set request.jwt.claim.sub='${owner}'`);
 const teams=(await db.query("insert into fm_teams(name,logo_path) values('Home','private/logo.png'),('Away','') returning *")).rows;
 const c=(await db.query("insert into fm_competitions(name) values('Public Cup') returning *")).rows[0];
 const hidden=(await db.query("insert into fm_competitions(name) values('Secret Cup') returning *")).rows[0];
 await db.query('insert into fm_entries(competition_id,team_id) values($1,$2),($1,$3)',[c.id,teams[0].id,teams[1].id]);
 let m=(await db.query('insert into fm_matches(competition_id,home_id,away_id) values($1,$2,$3) returning *',[c.id,teams[0].id,teams[1].id])).rows[0];
 m=(await db.query(`update fm_matches set obs_home_score=3,obs_away_score=2,obs_result='{"source":"manual"}',status='finished' where id=$1 and version=1 returning *`,[m.id])).rows[0];
 assert.deepEqual(score(m,[]),{home:3,away:2});assert.equal(standings(c,teams,[m],[])[0].points,3);
 assert.equal((await db.query('update fm_matches set obs_home_score=9 where id=$1 and version=1 returning *',[m.id])).rows.length,0);
 await db.exec('set role anon');
 assert.deepEqual((await db.query('select fm_public_competitions() as v')).rows[0].v,[]);
 assert.equal((await db.query('select fm_public_competition($1) as v',[c.id])).rows[0].v,null);
 await assert.rejects(db.query('select * from fm_matches'),/permission denied/);
 await assert.rejects(db.query("select fm_set_public_competition($1,true,'{}')",[c.id]),/permission denied/);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${other}'`);
 await assert.rejects(db.query("select fm_set_public_competition($1,true,'{}')",[c.id]),/not found/);
 await db.exec(`set request.jwt.claim.sub='${owner}'`);
 await db.query("select fm_set_public_competition($1,true,'{}')",[c.id]);
 await db.exec('set role anon');const published=(await db.query('select fm_public_competition($1) as v',[c.id])).rows[0].v;
 assert.equal(published.matches[0].obs_home_score,3);assert.equal(published.matches[0].obs_result.source,'manual');
 assert.equal(JSON.stringify(published).includes('owner_id'),false);assert.equal(JSON.stringify(published).includes('private/logo'),false);
 assert.equal((await db.query('select fm_public_competition($1) as v',[hidden.id])).rows[0].v,null);
 await assert.rejects(db.query("update fm_matches set status='live'"),/permission denied/);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);await db.query("select fm_set_public_competition($1,false,'{}')",[c.id]);await db.exec('set role anon');
 assert.equal((await db.query('select fm_public_competition($1) as v',[c.id])).rows[0].v,null);
 }finally{await db.close();}
});
test('broadcast event output escapes names and empty message uses actual score',()=>{
 assert.match(emptyEventsHTML({home:3,away:2},true),/3 : 2/);
 const html=broadcastEventsHTML({home_id:'h',obs_result:{events:[{kind:'goal',team:'home',player:'<img onerror=alert(1)>',matchTime:'12:34'}]}},[{id:'h',name:'<script>'}]);
 assert.equal(html.includes('<img'),false);assert.equal(html.includes('<script>'),false);assert.match(html,/12:34/);
});
