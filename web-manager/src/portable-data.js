export function matchPatch(match, teams, players, lineups, logos, current = {}) {
  const same = current.cloudMatchId === match.id;
  const patch = { cloudMatchId: match.id, cloudCompetitionId: match.competition_id, cloudFetchedAt: new Date().toISOString() };
  for (const [side, id] of [['home', match.home_id], ['away', match.away_id]]) {
    const t = teams.find(t => t.id === id);
    if (!t) throw new Error('ไม่พบข้อมูลทีมของนัดนี้');
    const old = new Map((same ? current[side+'Players'] || [] : []).map(p => [p.id,p.status]));
    const roles = new Map(lineups.filter(l => l.match_id === match.id && l.team_id === id).map(l => [l.player_id,l.role]));
    const kit = same ? current[side+'KitChoice'] || side : side;
    Object.assign(patch, {
      [side+'Name']:t.name, [side+'Logo']:logos[id] || '', [side+'Coach']:t.coach || '',
      [side+'RosterId']:id, [side+'TeamKits']:{home:t.home_color,away:t.away_color},
      [side+'KitChoice']:kit, [side+'KitColor']:kit === 'away' ? t.away_color : t.home_color,
      [side+'Players']:players.filter(p => p.team_id === id && (p.active || roles.has(p.id) || old.has(p.id))).map(p => ({id:p.id,number:p.number || '',name:p.name,position:p.position || '',status:old.get(p.id) || roles.get(p.id) || 'unselected'})),
    });
  }
  return patch;
}
export function assertCanLink(current, matchId) {
  if (current.timerRunning) throw new Error('หยุดเวลาชั่วคราวก่อนดึงข้อมูลทีม');
  if (current.cloudMatchId !== matchId && (Number(current.homeScore) || Number(current.awayScore) || (current.eventHistory || []).length || (current.timer && current.timer !== '00:00'))) {
    throw new Error('นัดปัจจุบันมีเวลา สกอร์ หรือเหตุการณ์อยู่ กรุณาสำรองและเตรียมนัดใหม่ก่อนเปลี่ยนนัดจากเว็บ');
  }
}
