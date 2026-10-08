const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function broadcastEventsHTML(match, teams) {
  const rows=match.obs_result?.events;
  if(!Array.isArray(rows)||!rows.length)return '';
  const labels={goal:'ประตู',yellow:'ใบเหลือง',red:'ใบแดง',second_yellow:'ใบเหลืองที่สอง',own_goal:'ประตูตัวเอง',substitution:'เปลี่ยนตัว'};
  return '<h3>เหตุการณ์จาก Control / OBS</h3><p class="form-help">ประวัติจากการถ่ายทอดสด ไม่รวมซ้ำกับสถิตินักเตะที่บันทึกบนเว็บ</p>'+rows.map(e=>{
    const team=teams.find(t=>t.id===(e.team==='away'?match.away_id:match.home_id));
    const detail=e.kind==='substitution'?`${e.playerOut||''} → ${e.playerIn||''}`:e.player||'ไม่ระบุนักเตะ';
    return `<div class="event-row"><time>${escape(e.matchTime)}</time><div class="desc"><strong>${escape(labels[e.kind]||e.kind)}</strong> · ${escape(detail)}<div class="muted">${escape(team?.name)}</div></div></div>`;
  }).join('');
}
export function emptyEventsHTML(score, synced) {
  return `<div class="empty">${synced==='manual'?'ยังไม่มีรายละเอียดเหตุการณ์ — ผลที่บันทึกบนเว็บ':synced?'ยังไม่มีรายละเอียดเหตุการณ์ — สกอร์จาก Control':'ยังไม่มีเหตุการณ์ — สกอร์'} ${score.home} : ${score.away}</div>`;
}
