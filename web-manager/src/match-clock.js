export function clockText(clock, syncedAt, now=Date.now()) {
  if(!clock)return {time:'--:--',label:'ยังไม่ได้รับเวลาจาก Control'};
  const parts=String(clock.timer||'00:00').split(':').map(Number);
  let seconds=(parts[0]||0)*60+(parts[1]||0);
  const synced=Date.parse(syncedAt),stale=clock.running&&(!Number.isFinite(synced)||now-synced>30000);
  if(clock.running&&clock.anchor&&Number.isFinite(synced))seconds+=Math.max(0,Math.floor((Math.min(now,synced+30000)-clock.anchor)/1000));
  const periods={'FIRST HALF':'ครึ่งแรก','HALF TIME':'พักครึ่ง','SECOND HALF':'ครึ่งหลัง','FULL TIME':'จบการแข่งขัน','EXTRA TIME':'ต่อเวลาพิเศษ','EXTRA TIME FIRST HALF':'ต่อเวลาครึ่งแรก','EXTRA TIME HALF TIME':'พักต่อเวลา','EXTRA TIME SECOND HALF':'ต่อเวลาครึ่งหลัง','PENALTY SHOOTOUT':'ดวลจุดโทษ'};
  return {time:String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'),label:(periods[clock.period]||clock.period||'')+(clock.added?' · ทดเวลา '+clock.added+' นาที':'')+(stale?' · รอข้อมูลล่าสุด':clock.running?'':' · เวลาหยุด')};
}
