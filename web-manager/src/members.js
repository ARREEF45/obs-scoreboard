import {escapeHTML as esc,icon} from './ui.js';
const permissionError=e=>e.message?.includes('OWNER_ONLY')?'เฉพาะเจ้าของรายการเท่านั้นที่จัดการผู้ดูแลได้':e.message?.includes('ALREADY_OWNER')?'อีเมลนี้เป็นเจ้าของรายการอยู่แล้ว':e.code==='PGRST202'?'กรุณาติดตั้ง SQL 010_competition_members.sql ก่อนใช้งาน':e.message||'ดำเนินการไม่สำเร็จ';
export async function memberEditor(client,competition){
 const dialog=document.querySelector('#modal');
 const rpc=async(name,args)=>{const {data,error}=await client.rpc(name,args);if(error)throw error;return data;};
 let working=false;
 async function draw(message=''){
  const data=await rpc('fm_list_competition_members',{p_id:competition.id});
  dialog.innerHTML=`<section class="member-editor"><div class="toolbar"><h2>ผู้ดูแลร่วม · ${esc(competition.name)}</h2><button type="button" data-action="close" aria-label="ปิด">×</button></div><p class="form-help">คุณเป็นเจ้าของรายการ เพิ่มหรือถอนสิทธิ์ผู้ดูแลได้เฉพาะรายการนี้ รอบย่อยแต่ละรอบกำหนดผู้ดูแลแยกกัน</p><div class="member-permissions">ผู้ดูแลร่วมจัดโปรแกรม รายชื่อผู้ลงแข่ง ผลการแข่งขัน และสถิติได้ การเพิ่มผู้ดูแล ลบรายการ เปิดสาธารณะ และจัดโครงสร้างรอบสงวนไว้สำหรับเจ้าของ<br>คลังทีมและนักเตะเป็นของผู้สร้างทีม ผู้ดูแลร่วมอ่านข้อมูลทีมที่เข้าร่วมได้</div><ul class="member-list">${data.members.map(m=>`<li><div><strong>${esc(m.email)}</strong><small>ผู้ดูแลร่วม</small></div><button type="button" class="danger" data-remove-user="${esc(m.user_id)}">ถอนสิทธิ์</button></li>`).join('')}${data.pending.map(m=>`<li><div><strong>${esc(m.email)}</strong><small>รอสมัคร / ยืนยันอีเมลและเข้าสู่ระบบ</small></div><button type="button" class="danger" data-remove-email="${esc(m.email)}">ยกเลิก</button></li>`).join('')||'<li class="muted">ยังไม่มีผู้ดูแลร่วม</li>'}</ul><form id="member-form"><label for="member-email">อีเมลผู้ดูแลร่วม</label><input id="member-email" name="email" type="email" required maxlength="254" autocomplete="off" placeholder="name@example.com"><button class="primary" type="submit">${icon('players')} เพิ่มผู้ดูแล</button></form><p class="form-help">บัญชีที่ยืนยันอีเมลแล้วได้รับสิทธิ์ทันที หากยังไม่มีบัญชี ให้ส่งลิงก์ด้านล่างเพื่อสมัครด้วยอีเมลที่ระบุ ระบบไม่ได้ส่งอีเมลเชิญอัตโนมัติ</p><div class="member-share"><input aria-label="ลิงก์สมัครสมาชิก" readonly value="${esc(new URL('./index.html?signup=1',location.href).href)}"><button type="button" id="copy-signup">คัดลอกลิงก์</button></div><p id="member-status" role="status">${esc(message)}</p></section>`;
  if(!dialog.open)dialog.showModal();
  dialog.querySelector('#member-form').onsubmit=e=>{e.preventDefault();run(async()=>{
   const status=await rpc('fm_add_competition_member',{p_id:competition.id,p_email:new FormData(e.target).get('email').trim()});
   await draw(status==='added'?'เพิ่มผู้ดูแลร่วมแล้ว':'บันทึกคำเชิญแล้ว ส่งลิงก์ให้ผู้ใช้สมัครและยืนยันอีเมล');
  });};
  dialog.querySelectorAll('[data-remove-user],[data-remove-email]').forEach(b=>b.onclick=()=>run(async()=>{
   if(!confirm('ถอนสิทธิ์หรือยกเลิกคำเชิญของผู้ใช้นี้?'))return;
   await rpc('fm_remove_competition_member',{p_id:competition.id,p_user:b.dataset.removeUser||null,p_email:b.dataset.removeEmail||null});await draw('ถอนสิทธิ์แล้ว');
  }));
  dialog.querySelector('#copy-signup').onclick=async()=>{try{await navigator.clipboard.writeText(new URL('./index.html?signup=1',location.href).href);dialog.querySelector('#member-status').textContent='คัดลอกลิงก์แล้ว';}catch{dialog.querySelector('.member-share input').select();dialog.querySelector('#member-status').textContent='เลือกลิงก์แล้ว กรุณาคัดลอก';}};
 }
 async function run(fn){if(working)return;working=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){dialog.querySelector('#member-status').textContent=permissionError(e);}finally{working=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 try{await draw();}catch(e){throw Error(permissionError(e));}
}

export function signupForm(client,back,onSession){
 document.querySelector('#app').innerHTML=`<section class="auth panel"><h2>สมัครสมาชิก</h2><p>สร้างและจัดการรายการแข่งขันของคุณ หรือเข้าร่วมรายการที่เจ้าของเพิ่มอีเมลของคุณไว้</p><form id="signup-form"><label for="signup-email">อีเมล</label><input id="signup-email" name="email" type="email" required autocomplete="email"><label for="signup-password">รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)</label><input id="signup-password" name="password" type="password" minlength="8" required autocomplete="new-password"><label for="signup-confirm">ยืนยันรหัสผ่าน</label><input id="signup-confirm" name="confirm" type="password" minlength="8" required autocomplete="new-password"><button class="primary" type="submit">สมัครสมาชิก</button></form><p id="signup-status" role="status"></p><button id="back-login" type="button">กลับเข้าสู่ระบบ</button></section>`;
 document.querySelector('#back-login').onclick=back;
 document.querySelector('#signup-form').onsubmit=async e=>{
  e.preventDefault();const form=e.target,f=new FormData(form),status=document.querySelector('#signup-status'),button=form.querySelector('button');
  if(button.disabled)return;
  if(f.get('password')!==f.get('confirm')){status.textContent='รหัสผ่านไม่ตรงกัน';return;}
  button.disabled=true;
  try{
   const {data,error}=await client.auth.signUp({email:f.get('email').trim(),password:f.get('password'),options:{emailRedirectTo:new URL('./index.html',location.href).href}});
   if(error)throw error;
   if(data.session){await onSession(data.user);return;}
   form.hidden=true;status.textContent='กรุณาตรวจอีเมลและจดหมายขยะเพื่อยืนยันบัญชี แล้วเข้าสู่ระบบ หากมีบัญชีอยู่แล้ว ให้เข้าสู่ระบบหรือใช้ลืมรหัสผ่าน';
  }catch(e){status.textContent=e.code==='signup_disabled'?'ระบบยังไม่เปิดรับสมัคร กรุณาแจ้งผู้ดูแลให้เปิดการสมัครใน Supabase':e.status===429?'ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่':'สมัครไม่สำเร็จ: '+(e.message||'กรุณาลองใหม่');}
  finally{button.disabled=false;}
 };
}
