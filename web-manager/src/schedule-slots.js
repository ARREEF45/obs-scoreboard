// One appearance per team per day; each round finishes before the next starts.
export function allocateSlots(rows,{start,teamsPerDay,venues,minutes,breakMinutes=0,gapDays=1}){
 const begin=new Date(start+':00+07:00').getTime();
 const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
 if(!Number.isFinite(begin))throw Error('เลือกวันและเวลาเริ่มแข่งขัน');
 if(!integer(teamsPerDay,2,256))throw Error('จำนวนทีมต่อวันต้องเป็น 2–256 ทีม');
 if(!integer(minutes,1,720)||!integer(breakMinutes,0,240)||!integer(gapDays,1,365))throw Error('ตรวจระยะเวลาแข่งขัน เวลาพัก และระยะห่างรอบ');
 const names=venues.map(s=>s.trim());
 if(!integer(names.length,1,32)||names.some(s=>!s)||new Set(names).size!==names.length)throw Error('ระบุชื่อสนาม 1–32 สนามโดยไม่ซ้ำกัน');
 const dayMs=86400000,minuteMs=60000;
 const local=new Date(begin+7*3600000),startMinute=local.getUTCHours()*60+local.getUTCMinutes();
 if(startMinute+minutes>1440)throw Error('เวลาเริ่มและระยะเวลาแข่งขันต้องจบภายในวันเดียวกัน');
 let day=0,previous=null,used=new Set(),slots=names.map(()=>0);const result=[];
 const nextDay=offset=>{day+=offset;used=new Set();slots=names.map(()=>0);};
 for(const m of [...rows].sort((a,b)=>a.round-b.round)){
  if(previous!==null&&m.round!==previous)nextDay(gapDays);
  previous=m.round;
  let court=0;
  const pick=()=>{court=slots.indexOf(Math.min(...slots));};pick();
  if(used.size+2>teamsPerDay||used.has(m.home_id)||used.has(m.away_id)||startMinute+slots[court]*(minutes+breakMinutes)+minutes>1440){nextDay(1);pick();}
  const slot=slots[court]++;
  result.push({...m,kickoff:new Date(begin+day*dayMs+slot*(minutes+breakMinutes)*minuteMs).toISOString(),venue:names[court],courtOrder:slot+1});
  used.add(m.home_id);used.add(m.away_id);
 }
 return result;
}
