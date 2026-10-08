import './style.css';
import './public.css';
import { createClient } from '@supabase/supabase-js';
import {score,standings,playerStats,statusLabels,kindLabels} from './domain.js';
import {clockText} from './match-clock.js';
import {broadcastEventsHTML} from './broadcast-events.js';
const client=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root=document.querySelector('#public-content'),select=document.querySelector('#public-competition'),notice=document.querySelector('#public-status');
let data=null,tab='matches',selectedMatch='',generation=0,loading=false;
const date=v=>v?new Date(v).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}):'ยังไม่กำหนดเวลา';
const team=id=>data.teams.find(t=>t.id===id),player=id=>data.players.find(p=>p.id===id);
const crest=t=>/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(t?.public_logo||'')?`<img class="crest" alt="" src="${t.public_logo}">`:'<span class="crest">⚽</span>';
function table(headers,rows){return `<div class="table-wrap"><table><thead><tr>${headers.map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(t=>`<td>${t}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function render(){
 if(!data){root.innerHTML='<div class="empty">ยังไม่มีรายการแข่งขันที่เปิดเผยต่อสาธารณะ</div>';return;}
 document.querySelector('#public-title').textContent=data.competition.name;
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('primary',b.dataset.tab===tab));
 if(tab==='matches')root.innerHTML=`<div class="cards">${data.matches.map(m=>{const s=score(m,data.events);return `<article class="panel"><small>${escape(statusLabels[m.status])} · รอบ ${m.round}</small><h2>${escape(team(m.home_id)?.name)} <span class="score">${s.home} : ${s.away}</span> ${escape(team(m.away_id)?.name)}</h2><p>${date(m.kickoff)} · ${escape(m.venue)}</p><p data-clock="${escape(m.id)}"></p><button data-match="${escape(m.id)}">รายละเอียด / รายชื่อ / เหตุการณ์</button></article>`;}).join('')||'<p>ยังไม่มีโปรแกรมแข่งขัน</p>'}</div>`;
 if(tab==='standings')root.innerHTML=`<div class="panel"><h2>ตารางคะแนน</h2><p>คำนวณจากนัดที่จบการแข่งขันแล้ว</p>${table(['#','ทีม','แข่ง','ชนะ','เสมอ','แพ้','ได้','เสีย','ผลต่าง','คะแนน'],standings(data.competition,data.teams,data.matches,data.events).map((r,i)=>[i+1,escape(r.name),r.played,r.won,r.drawn,r.lost,r.gf,r.ga,r.gf-r.ga,r.points]))}</div>`;
 if(tab==='teams')root.innerHTML=`<div class="cards">${data.teams.map(t=>`<article class="panel"><div class="team-head">${crest(t)}<h2>${escape(t.name)}</h2></div><p>ผู้คุมทีม ${escape(t.coach)||'—'}</p><p>ชุดเหย้า ${escape(t.home_color)} · ชุดเยือน ${escape(t.away_color)}</p>${table(['เบอร์','นักเตะ','ตำแหน่ง'],data.players.filter(p=>p.team_id===t.id&&p.active).map(p=>[escape(p.number),escape(p.name),escape(p.position)]))}</article>`).join('')}</div>`;
 if(tab==='stats')root.innerHTML=`<div class="panel"><h2>สถิตินักเตะ</h2><p>คำนวณจากประตู แอสซิสต์ และใบที่ผู้ดูแลบันทึกเป็นเหตุการณ์ ไม่ประมาณสถิติจากสกอร์รวม</p>${table(['นักเตะ','ทีม','ประตู','แอสซิสต์','เหลือง','แดง','เข้าประตูตัวเอง'],playerStats(data.players,data.matches,data.events,data.competition.id).map(p=>[escape(p.name),escape(team(p.team_id)?.name),p.goals,p.assists,p.yellow,p.red,p.own_goals]))}</div>`;
 if(tab==='detail'){
   const m=data.matches.find(m=>m.id===selectedMatch);if(!m){tab='matches';render();return;}const s=score(m,data.events);
   root.innerHTML=`<article class="panel"><button data-tab="matches">กลับโปรแกรม</button><h2>${escape(team(m.home_id)?.name)} ${s.home} : ${s.away} ${escape(team(m.away_id)?.name)}</h2><p>${escape(statusLabels[m.status])} · ${date(m.kickoff)} · ${escape(m.venue)}</p><p data-clock="${escape(m.id)}"></p>${broadcastEventsHTML(m,data.teams)}<h3>เหตุการณ์ที่บันทึกบนเว็บ</h3>${data.events.filter(e=>e.match_id===m.id).map(e=>`<p>${e.minute}${e.added?'+'+e.added:''}′ ${escape(kindLabels[e.kind])} · ${escape(player(e.player_id)?.name||team(e.team_id)?.name)}${e.assist_id?' · แอสซิสต์ '+escape(player(e.assist_id)?.name):''}</p>`).join('')||'<p>ยังไม่มีรายละเอียดเหตุการณ์</p>'}<div class="cards">${[m.home_id,m.away_id].map(id=>`<section><h3>${escape(team(id)?.name)}</h3>${table(['เบอร์','นักเตะ','รายชื่อ'],data.lineups.filter(l=>l.match_id===m.id&&l.team_id===id).map(l=>[escape(player(l.player_id)?.number),escape(player(l.player_id)?.name),l.role==='starter'?'ตัวจริง':'ตัวสำรอง']))}</section>`).join('')}</div></article>`;
 }
 paintClocks();
}
function paintClocks(){root.querySelectorAll('[data-clock]').forEach(n=>{const m=data?.matches.find(m=>m.id===n.dataset.clock);const clock=m?.obs_result?.clock;if(!clock){n.textContent='';return;}const t=clockText(clock,m.obs_synced_at);n.textContent=t.time+' · '+t.label;});}
async function load(reset=false){
 const token=++generation;const id=select.value;
 if(reset){data=null;root.innerHTML='<p>กำลังโหลด…</p>';}
 try{
   if(!id){data=null;render();return;}
   const {data:payload,error}=await client.rpc('fm_public_competition',{p_id:id});if(error)throw error;if(token!==generation)return;
   data=payload;render();notice.textContent=payload?'อัปเดต '+new Date().toLocaleTimeString('th-TH'):'รายการนี้ไม่ได้เปิดเผยแล้ว';
 }catch(e){if(token!==generation)return;notice.textContent='โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่'+(e.code==='PGRST202'?' (ผู้ดูแลต้องติดตั้ง SQL สำหรับหน้าสาธารณะ)':'');}
}
async function list(){const {data:rows,error}=await client.rpc('fm_public_competitions');if(error)throw error;select.replaceChildren(...rows.map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name+(c.season?' · '+c.season:'');return o;}));const requested=new URLSearchParams(location.search).get('competition');if(rows.some(c=>c.id===requested))select.value=requested;await load(true);}
select.onchange=()=>{selectedMatch='';tab='matches';const url=new URL(location.href);url.searchParams.set('competition',select.value);history.replaceState(null,'',url);load(true);};
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.tab){tab=b.dataset.tab;render();}if(b.dataset.match){selectedMatch=b.dataset.match;tab='detail';render();}if(b.id==='public-refresh')list().catch(()=>notice.textContent='โหลดข้อมูลไม่สำเร็จ');});
list().catch(()=>{notice.textContent='ยังเปิดข้อมูลสาธารณะไม่ได้ ผู้ดูแลต้องติดตั้ง SQL และเปิดเผยรายการแข่งขัน';render();});
setInterval(()=>{if(!document.hidden&&!loading){loading=true;load().finally(()=>loading=false);}},10000);setInterval(paintClocks,1000);
