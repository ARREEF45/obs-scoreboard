-- Run once after 001 and 002. Does not delete existing data.
begin;
alter table public.fm_matches
 add column obs_home_score integer check(obs_home_score between 0 and 999),
 add column obs_away_score integer check(obs_away_score between 0 and 999),
 add column obs_result jsonb,
 add column obs_synced_at timestamptz;

create function public.fm_sync_broadcast_result(p_match uuid, p_expected_version integer, p_result jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.fm_matches; h integer; a integer; next_status text;
begin
 select * into m from public.fm_matches where id=p_match and owner_id=auth.uid() for update;
 if not found then raise exception 'Match not found'; end if;
 h=(p_result->>'home')::integer; a=(p_result->>'away')::integer; next_status=p_result->>'status';
 if h is null or a is null or h not between 0 and 999 or a not between 0 and 999 or next_status is null or next_status not in ('scheduled','live','finished') then raise exception 'Invalid broadcast result'; end if;
 -- Lost responses and concurrent controllers retry safely without another update.
 if m.obs_result=p_result and m.status=next_status and m.obs_home_score=h and m.obs_away_score=a then
   return jsonb_build_object('version',m.version,'synced_at',m.obs_synced_at);
 end if;
 if m.version is distinct from p_expected_version then raise exception 'BROADCAST_CONFLICT: match changed on the web'; end if;
 if m.status='cancelled' then raise exception 'BROADCAST_CONFLICT: match cancelled'; end if;
 update public.fm_matches set obs_home_score=h,obs_away_score=a,obs_result=p_result,obs_synced_at=now(),status=next_status
 where id=p_match and owner_id=auth.uid() returning * into m;
 return jsonb_build_object('version',m.version,'synced_at',m.obs_synced_at);
end $$;
revoke all on function public.fm_sync_broadcast_result(uuid,integer,jsonb) from public,anon;
grant execute on function public.fm_sync_broadcast_result(uuid,integer,jsonb) to authenticated;
commit;
