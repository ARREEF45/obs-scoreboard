-- Run once after 003_broadcast_results.sql. Private tables remain private.
begin;
alter table public.fm_competitions add column is_public boolean not null default false;
alter table public.fm_teams add column public_logo text not null default '' check(length(public_logo)<=200000);

create function public.fm_set_public_competition(p_id uuid,p_public boolean,p_logos jsonb default '{}'::jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare item record;
begin
 perform 1 from public.fm_competitions where id=p_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Competition not found';end if;
 for item in select key,value from jsonb_each_text(p_logos) loop
   if length(item.value)>200000 or (item.value<>'' and item.value !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'Invalid public logo';end if;
   update public.fm_teams set public_logo=item.value where id=item.key::uuid and owner_id=auth.uid()
     and exists(select 1 from public.fm_entries where competition_id=p_id and team_id=item.key::uuid and owner_id=auth.uid());
 end loop;
 update public.fm_competitions set is_public=p_public where id=p_id and owner_id=auth.uid();
end $$;
revoke all on function public.fm_set_public_competition(uuid,boolean,jsonb) from public,anon;
grant execute on function public.fm_set_public_competition(uuid,boolean,jsonb) to authenticated;

create function public.fm_public_competitions() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(c) order by c.name),'[]'::jsonb) from
 (select id,name,season from public.fm_competitions where is_public) c;
$$;
create function public.fm_public_competition(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare output jsonb;
begin
 if not exists(select 1 from public.fm_competitions where id=p_id and is_public) then return null;end if;
 select jsonb_build_object(
 'competition',(select to_jsonb(c) from (select id,name,season,win_points,draw_points,loss_points from public.fm_competitions where id=p_id) c),
 'teams',(select coalesce(jsonb_agg(to_jsonb(t) order by t.name),'[]'::jsonb) from
   (select id,name,coach,home_color,away_color,public_logo from public.fm_teams where id in(select team_id from public.fm_entries where competition_id=p_id)) t),
 'players',(select coalesce(jsonb_agg(to_jsonb(p) order by p.name),'[]'::jsonb) from
   (select id,team_id,name,number,position,active from public.fm_players where team_id in(select team_id from public.fm_entries where competition_id=p_id)) p),
 'matches',(select coalesce(jsonb_agg(to_jsonb(m) order by m.kickoff nulls last),'[]'::jsonb) from
   (select id,competition_id,home_id,away_id,kickoff,venue,round,status,obs_home_score,obs_away_score,obs_synced_at,
      jsonb_build_object('clock',obs_result->'clock','events',obs_result->'events','source',obs_result->'source') as obs_result
    from public.fm_matches where competition_id=p_id) m),
 'lineups',(select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) from
   (select match_id,team_id,player_id,role from public.fm_lineups where match_id in(select id from public.fm_matches where competition_id=p_id)) l),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.minute,e.added),'[]'::jsonb) from
   (select id,match_id,team_id,player_id,assist_id,kind,minute,added from public.fm_events where match_id in(select id from public.fm_matches where competition_id=p_id)) e)
 ) into output;
 return output;
end $$;
revoke all on function public.fm_public_competitions() from public;
revoke all on function public.fm_public_competition(uuid) from public;
grant execute on function public.fm_public_competitions() to anon,authenticated;
grant execute on function public.fm_public_competition(uuid) to anon,authenticated;
commit;
