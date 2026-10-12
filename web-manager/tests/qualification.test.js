import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualificationStatus,qualificationTable} from '../src/qualification-table.js';
const rows=[{id:'a',name:'A',played:1,points:3,gf:2,ga:0},{id:'b',name:'B',played:1,points:0,gf:0,ga:2}];
test('qualification distinguishes provisional rank, explicit confirmation and tied cutoff',()=>{
 const c={format:'league',advance_to:'next',advance_count:1};
 assert.deepEqual(qualificationStatus(rows,c).map(s=>s.kind),['zone','']);
 assert.deepEqual(qualificationStatus(rows,{...c,tournament_state:{external_qualifiers:['b']}}).map(s=>s.kind),['','qualified']);
 assert.deepEqual(qualificationStatus(rows.map(r=>({...r,played:0})),c).map(s=>s.kind),['','']);
 const tied=rows.map(r=>({...r,points:1,gf:0,ga:0}));
 assert.deepEqual(qualificationStatus(tied,c).map(s=>s.kind),['tied','tied']);
 assert.deepEqual(qualificationStatus(rows,{format:'groups',tournament_state:{qualifying_places:1}}).map(s=>s.kind),['zone','']);
 assert.deepEqual(qualificationStatus(rows,{...c,tournament_state:{qualifying_places:0}}).map(s=>s.kind),['','']);
 assert.equal(qualificationTable([{...rows[0],name:'<script>'}],c).includes('<script>'),false);
});
