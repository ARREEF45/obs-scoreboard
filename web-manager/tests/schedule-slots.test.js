import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allocateSlots} from '../src/schedule-slots.js';
const rows=Array.from({length:4},(_,i)=>({round:1,home_id:'h'+i,away_id:'a'+i}));
const opts={start:'2026-11-01T09:00',teamsPerDay:8,venues:['A'],minutes:90,breakMinutes:15,gapDays:1};
test('single field sequences games; multiple fields share start and preserve daily team limit',()=>{
 const one=allocateSlots(rows,opts);assert.deepEqual(one.map(m=>m.kickoff.slice(11,16)),['02:00','03:45','05:30','07:15']);assert.deepEqual(one.map(m=>m.courtOrder),[1,2,3,4]);
 const two=allocateSlots(rows,{...opts,venues:['A','B'],teamsPerDay:4});
 assert.deepEqual(two.map(m=>m.venue),['A','B','A','B']);assert.equal(two[0].kickoff,two[1].kickoff);assert.equal(new Date(two[2].kickoff)-new Date(two[0].kickoff),86400000);
});
test('odd daily capacity, repeated teams, midnight and rounds do not overbook',()=>{
 const odd=allocateSlots(rows,{...opts,teamsPerDay:3});assert.equal(new Date(odd[3].kickoff)-new Date(odd[0].kickoff),3*86400000);
 const repeated=allocateSlots([rows[0],{...rows[1],home_id:rows[0].home_id}],{...opts,venues:['A','B']});assert.equal(new Date(repeated[1].kickoff)-new Date(repeated[0].kickoff),86400000);
 const late=allocateSlots(rows,{...opts,start:'2026-11-01T22:00'});assert.equal(new Date(late[1].kickoff)-new Date(late[0].kickoff),86400000);
 const rounds=allocateSlots([...rows,{round:2,home_id:'h0',away_id:'a1'}],{...opts,teamsPerDay:4,gapDays:7});assert.equal(new Date(rounds[4].kickoff)-new Date(rounds[0].kickoff),8*86400000);
 assert.throws(()=>allocateSlots(rows,{...opts,venues:['A','A']}));assert.throws(()=>allocateSlots(rows,{...opts,minutes:0}));assert.throws(()=>allocateSlots(rows,{...opts,start:'2026-11-01T23:30'}));
});
