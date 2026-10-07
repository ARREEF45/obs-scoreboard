import { createClient } from '@supabase/supabase-js';
import { matchPatch, assertCanLink } from './portable-data.js';
const WEB = 'https://arreef45.github.io/obs-scoreboard/manager/';
const client = createClient('https://ascxzymhwswfwpjwzcdx.supabase.co','sb_publishable_dk_I0UMWyE12KKFIzt7Xvg_Y46QOXsz', {auth:{storageKey:'obs-cloud-auth',detectSessionInUrl:false}});
const el = (tag, text, parent) => {const n=document.createElement(tag);if(text)n.textContent=text;parent?.append(n);return n;};
const button = (label, parent, fn) => {const b=el('button',label,parent);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){status(e.message);}finally{b.disabled=false;}};return b;};
const status = text => document.querySelector('#cloud-status').textContent=text;
async function local(path='/api/state',options={}) {const r=await fetch(path,{cache:'no-store',...options,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('เชื่อมต่อ Scoreboard Server ไม่สำเร็จ');return r.json();}
async function all(table, configure=q=>q) {let result=[];for(let from=0;;from+=1000){const {data,error}=await configure(client.from('fm_'+table).select('*')).order('id').range(from,from+999);if(error)throw error;result.push(...data);if(data.length<1000)return result;}}
async function write(patch) {return local('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...patch,syncClientId:'cloud-control',syncUpdatedAt:Date.now()+'-'+Math.random()})});}
function link(parent,text,url) {const a=el('a',text,parent);a.href=url;a.target='_blank';a.rel='noopener';return a;}
async function control() {
  const root=document.querySelector('#cloud-panel');if(!root)return;
  const body=el('div','',root);const s=el('p','',root);s.id='cloud-status';
  link(root,'จัดการทีม นักเตะ และโปรแกรมแข่งขันบนเว็บ',WEB);
  async function login() {
    body.replaceChildren();el('p','เข้าสู่ระบบด้วยบัญชีเดียวกับเว็บจัดการทีม',body);
    const form=el('form','',body),email=el('input','',form),pass=el('input','',form);
    email.type='email';email.placeholder='อีเมล';email.required=true;email.autocomplete='username';
    pass.type='password';pass.placeholder='รหัสผ่าน';pass.required=true;pass.autocomplete='current-password';
    const submit=el('button','เข้าสู่ระบบเว็บ',form);submit.type='submit';
    form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{const {error}=await client.auth.signInWithPassword({email:email.value.trim(),password:pass.value});pass.value='';if(error)throw Error('เข้าสู่ระบบไม่สำเร็จ ['+(error.code||error.message)+']');await fixtures();}catch(e){status(e.message);}finally{submit.disabled=false;}};
    link(body,'ตั้งรหัสผ่านใหม่บนเว็บ',WEB);
  }
  async function fixtures() {
    const matches=await all('matches'),teams=await all('teams'),competitions=await all('competitions');
    body.replaceChildren();const select=el('select','',body);select.id='cloud-match';
    const name=id=>teams.find(t=>t.id===id)?.name||'?';
    el('option','เลือกนัดแข่งขัน',select).value='';
    for(const m of matches.filter(m=>!['cancelled','finished'].includes(m.status)).sort((a,b)=>(a.kickoff||'').localeCompare(b.kickoff||''))) {const option=el('option',`${competitions.find(c=>c.id===m.competition_id)?.name||''} · ${name(m.home_id)} — ${name(m.away_id)} · ${m.kickoff?new Date(m.kickoff).toLocaleString('th-TH'):'ไม่กำหนดเวลา'}`,select);option.value=m.id;}
    button('ดึงทีมและนักเตะนัดที่เลือก',body,async()=>{
      if(!select.value)throw Error('เลือกนัดก่อน');
      const m=matches.find(m=>m.id===select.value);
      const current=await local();assertCanLink(current,m.id);
      if(!confirm('ดึงชื่อทีม โลโก้ และนักเตะจากเว็บ? เวลาและสกอร์เดิมจะคงไว้ รายชื่อนัดเดิมที่เลือกใน Control จะคงไว้'))return;
      status('กำลังดาวน์โหลดข้อมูลและโลโก้…');
      const freshTeams=await all('teams',q=>q.in('id',[m.home_id,m.away_id]));
      const players=await all('players',q=>q.in('team_id',[m.home_id,m.away_id]));
      const lineups=await all('lineups',q=>q.eq('match_id',m.id));const logos={};
      for(const t of freshTeams){if(!t.logo_path)continue;const {data,error}=await client.storage.from('fm-logos').download(t.logo_path);if(error)throw Error('ดาวน์โหลดโลโก้ '+t.name+' ไม่สำเร็จ: '+error.message);logos[t.id]=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(data);});}
      const latest=await local();assertCanLink(latest,m.id);
      const patch=matchPatch(m,freshTeams,players,lineups,logos,latest);
      await window.applyCloudMatch(patch);
      status('ดึงข้อมูลแล้ว: '+patch.homeName+' — '+patch.awayName+' · จัดตัวจริง–สำรองได้ใน “จัดรายชื่อนัดนี้”');
    });
    button('โหลดโปรแกรมใหม่',body,fixtures);
    button('ออกจากบัญชีเว็บ',body,async()=>{await client.auth.signOut();await login();status('ออกจากบัญชีเว็บแล้ว ข้อมูลถ่ายทอดสดในเครื่องยังอยู่');});
    status('เลือกนัดแล้วดึงข้อมูลก่อนเริ่มเวลา ใช้ข้อมูลที่ดึงไว้ต่อได้เมื่ออินเทอร์เน็ตหลุด');
  }
  const {data}=await client.auth.getSession();try{if(data.session)await fixtures();else await login();}catch(e){await login();status(e.message);}
}
async function lineup() {
  const root=document.querySelector('#cloud-lineup');if(!root)return;
  let snapshot;const content=el('div','',root),s=el('p','',root);s.id='cloud-status';
  const fingerprint = state => JSON.stringify([state.cloudMatchId,...['home','away'].flatMap(side=>[state[side+'Players'],state[side+'KitChoice']])]);
  async function render() {
    const state=await local();snapshot=state;content.replaceChildren();
    if(!state.cloudMatchId){status('กลับ Control เพื่อเลือกนัดและดึงข้อมูลจากเว็บก่อน');return;}
    for(const side of ['home','away']) {
      const section=el('section','',content);el('h2',state[side+'Name'],section);
      const kit=el('select','',section);kit.id=side+'-kit';for(const [v,t] of [['home','ชุดเหย้า'],['away','ชุดเยือน']])el('option',t,kit).value=v;kit.value=state[side+'KitChoice']||side;
      for(const p of state[side+'Players']||[]){const row=el('label','',section);el('span',`${p.number} ${p.name} · ${p.position}`,row);const role=el('select','',row);role.dataset.side=side;role.dataset.id=p.id;for(const [v,t] of [['unselected','ไม่เลือก'],['starter','ตัวจริง'],['substitute','ตัวสำรอง']])el('option',t,role).value=v;role.value=p.status;}
    }
    status('เลือกตัวจริงไม่เกิน 11 คนต่อทีม ผู้เล่นที่ไม่เลือกจะไม่แสดงในกราฟิก');
  }
  button('โหลดข้อมูลล่าสุด',root,render);
  button('ใช้รายชื่อและชุดแข่งใน OBS',root,async()=>{
    if(!snapshot?.cloudMatchId)throw Error('ยังไม่ได้เลือกนัด');
    const current=await local();if(fingerprint(current)!==fingerprint(snapshot))throw Error('รายชื่อถูกเปลี่ยนจากอีกเครื่อง กรุณาโหลดข้อมูลล่าสุดก่อน');
    const patch={};for(const side of ['home','away']){const roles=new Map([...content.querySelectorAll(`select[data-side=${side}]`)].map(n=>[n.dataset.id,n.value]));const players=(snapshot[side+'Players']||[]).map(p=>({...p,status:roles.get(p.id)||'unselected'}));if(players.filter(p=>p.status==='starter').length>11)throw Error('เลือกตัวจริงได้สูงสุด 11 คนต่อทีม');patch[side+'Players']=players;patch[side+'KitChoice']=document.querySelector('#'+side+'-kit').value;patch[side+'KitColor']=current[side+'TeamKits'][patch[side+'KitChoice']];}
    await write(patch);await render();status('ใช้รายชื่อใน OBS แล้ว (ไม่แก้คลังทีมบนเว็บ)');
  });
  link(root,'แก้ข้อมูลทีมและนักเตะบนเว็บ',WEB);await render();
}
window.addEventListener('load',()=>{control().catch(e=>status(e.message));lineup().catch(e=>status(e.message));});
