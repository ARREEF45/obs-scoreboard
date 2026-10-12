import {escapeHTML as esc} from './ui.js';
export function qualificationStatus(rows,c){
 const state=c.tournament_state||{};
 const confirmed=new Set([...(state.external_qualifiers||[]),...(c.format==='groups'?state.group_qualifiers||[]:[])]);
 const explicit=state.qualifying_places;
 const places=explicit!==undefined?Number(explicit):(c.format==='groups'?0:(c.advance_to||c.has_next_stage)?Number(c.advance_count||0):0);
 const started=rows.some(r=>r.played>0);
 const cutoff=places>0&&places<rows.length?rows[places-1]:null;
 const tied=cutoff&&rows[places]&&cutoff.points===rows[places].points&&cutoff.gf-cutoff.ga===rows[places].gf-rows[places].ga&&cutoff.gf===rows[places].gf;
 return rows.map((r,i)=>{
  if(confirmed.has(r.id))return {kind:'qualified',label:'ยืนยันเข้ารอบแล้ว'};
  if(confirmed.size||!started||!places)return {kind:'',label:''};
  if(tied&&r.points===cutoff.points&&r.gf-r.ga===cutoff.gf-cutoff.ga&&r.gf===cutoff.gf)return {kind:'tied',label:'รอตัดสินอันดับเข้ารอบ'};
  return i<places?{kind:'zone',label:'อันดับเข้ารอบ (ยังไม่ยืนยัน)'}:{kind:'',label:''};
 });
}
export function qualificationTable(rows,c){
 const statuses=qualificationStatus(rows,c);
 const active=statuses.some(s=>s.kind);
 return `<div class="table-wrap"><table><thead><tr>${['#','ทีม','แข่ง','ชนะ','เสมอ','แพ้','ได้','เสีย','ผลต่าง','คะแนน'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr class="qualification-row ${statuses[i].kind}"><td>${i+1}</td><td>${esc(r.name)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gf-r.ga}</td><td><strong>${r.points}</strong></td></tr>`).join('')}</tbody></table></div>${active?'<div class="qualification-legend"><span class="qualification-badge qualified">✓ ยืนยันเข้ารอบแล้ว</span><span class="qualification-badge zone">อันดับเข้ารอบ ณ ปัจจุบัน</span><span class="qualification-badge tied">รอตัดสินอันดับ</span></div><p class="form-help">อันดับปัจจุบันยังไม่ใช่ผลยืนยันเข้ารอบ ผู้จัดตรวจตามกติกาและยืนยันอีกครั้ง</p>':''}`;
}
