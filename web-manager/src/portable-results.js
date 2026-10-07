export function resultOf(state) {
  const home=Number(state.homeScore||0),away=Number(state.awayScore||0);
  if(!Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0||home>999||away>999)throw Error('สกอร์ไม่ถูกต้อง');
  return {home,away,status:state.period==='FULL TIME'?'finished':state.timerRunning||state.timer&&state.timer!=='00:00'||home||away?'live':'scheduled',
    clock:{timer:/^\d{1,3}:\d{2}$/.test(state.timer||'')?state.timer:'00:00',running:!!state.timerRunning,anchor:Number(state.timerUpdatedAt)||0,period:state.period||'FIRST HALF',added:state.showAddedTime?Number(state.addedTime)||0:0},
    heartbeat:state.timerRunning?Math.floor(Date.now()/10000):0};
}
// Queue is scoped to the authenticated owner. It survives browser reloads and keeps old matches until acknowledged.
export function makeResultSender({storage,send,report}) {
  let busy=false;
  const read=owner=>JSON.parse(storage.getItem('obs-result-queue:'+owner)||'{}');
  const save=(owner,q)=>storage.setItem('obs-result-queue:'+owner,JSON.stringify(q));
  return {
    resolve(owner,state,version){const q=read(owner),payload=resultOf(state);q[state.cloudMatchId]={version,seen:JSON.stringify(payload),acked:null,pending:payload,blocked:false};save(owner,q);},
    observe(owner,state){
      if(!state.cloudMatchId||state.cloudOwnerId!==owner||!state.cloudResultVersion)return;
      const q=read(owner),id=state.cloudMatchId,payload=resultOf(state),fingerprint=JSON.stringify(payload);
      let item=q[id];
      if(!item){item=q[id]={version:state.cloudResultVersion,seen:state.cloudResultBaseline,acked:state.cloudResultBaseline,pending:null};}
      if(state.cloudResultVersion>item.version){item.version=state.cloudResultVersion;item.blocked=false;item.acked=state.cloudResultBaseline;item.pending=fingerprint===item.acked?null:payload;item.seen=fingerprint;save(owner,q);}
      if(item.seen!==fingerprint){item.seen=fingerprint;item.pending=payload;save(owner,q);}
    },
    async flush(owner){
      if(busy)return;busy=true;
      try{for(const [id,item] of Object.entries(read(owner))){
        if(!item.pending)continue;
        if(item.blocked){report('ผลบนเว็บเปลี่ยนแล้ว: หยุดส่งนัด '+id+' เพื่อป้องกันการทับข้อมูล');continue;}
        const payload=item.pending;
        try{
          const ack=await send(id,item.version,payload);const q=read(owner),latest=q[id];
          if(!latest)continue;latest.version=ack.version;latest.acked=JSON.stringify(payload);
          if(JSON.stringify(latest.pending)===latest.acked)latest.pending=null;
          save(owner,q);report('ส่งผลขึ้นเว็บแล้ว '+payload.home+' : '+payload.away+' · '+(payload.status==='finished'?'จบการแข่งขัน':'กำลังอัปเดต'));
        }catch(e){
          const q=read(owner);if(String(e.message).includes('BROADCAST_CONFLICT')){q[id].blocked=true;save(owner,q);report('ผลบนเว็บถูกแก้จากอีกเครื่อง หยุดส่งอัตโนมัติเพื่อป้องกันข้อมูลทับกัน');}
          else if(e.code==='PGRST202'||e.code==='42883')report('ยังไม่ได้ติดตั้ง SQL 003_broadcast_results.sql — เก็บผลรอส่งไว้แล้ว');
          else report('ส่งผลยังไม่สำเร็จ เก็บไว้แล้วและจะลองใหม่: '+e.message);
        }
      }}finally{busy=false;}
    }
  };
}
