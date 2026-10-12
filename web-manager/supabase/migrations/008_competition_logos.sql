-- Run after 007. Logos are small embedded raster images; only published competitions expose them.
begin;
alter table public.fm_competitions add column logo_data text not null default ''
 check(length(logo_data)<=200000 and (logo_data='' or logo_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'));
create or replace function public.fm_copy_season(p_id uuid,p_season text,p_copy_teams boolean) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.fm_competitions; item public.fm_competitions; new_id uuid; ids jsonb:='{}'; key uuid;
begin
 select * into c from public.fm_competitions where id=p_id and owner_id=auth.uid() for update;
 if not found or c.parent_id is not null or length(trim(p_season))=0 then raise exception 'Choose a main competition and a season';end if;
 key:=coalesce(c.series_key,gen_random_uuid());
 if c.series_key is null then
  if length(trim(c.season))=0 then raise exception 'Set the current season first';end if;
  update public.fm_competitions set series_key=key where id=c.id;
 end if;
 for item in with recursive tree as(select id,0 as depth from public.fm_competitions where id=c.id union all select ch.id,t.depth+1 from public.fm_competitions ch join tree t on ch.parent_id=t.id where ch.owner_id=auth.uid()) select fc.* from tree t join public.fm_competitions fc on fc.id=t.id order by t.depth loop
  insert into public.fm_competitions(name,season,win_points,draw_points,loss_points,series_key,parent_id,format,advance_count,group_count,qualification_rules,logo_data)
  values(item.name,trim(p_season),item.win_points,item.draw_points,item.loss_points,case when item.id=c.id then key else null end,(ids->>item.parent_id::text)::uuid,item.format,item.advance_count,item.group_count,item.qualification_rules,item.logo_data) returning id into new_id;
  ids:=ids||jsonb_build_object(item.id::text,new_id);
  if p_copy_teams then insert into public.fm_entries(competition_id,team_id) select new_id,team_id from public.fm_entries where competition_id=item.id;end if;
 end loop;
 for item in select * from public.fm_competitions where id in(select x::uuid from jsonb_object_keys(ids) x) loop
  if ids ? item.advance_to::text then update public.fm_competitions set advance_to=(ids->>item.advance_to::text)::uuid where id=(ids->>item.id::text)::uuid;end if;
 end loop;
 return (ids->>c.id::text)::uuid;
end $$;
create or replace function public.fm_public_competition(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare output jsonb;
begin
 if not exists(select 1 from public.fm_competitions where id=p_id and is_public) then return null;end if;
 select jsonb_build_object(
 'competition',(select to_jsonb(c) from (select id,name,season,parent_id,format,logo_data,starts_on,ends_on,qualification_rules,win_points,draw_points,loss_points from public.fm_competitions where id=p_id) c),
 'teams',(select coalesce(jsonb_agg(to_jsonb(t) order by t.name),'[]'::jsonb) from
   (select id,name,coach,home_color,away_color,public_logo from public.fm_teams where id in(select team_id from public.fm_entries where competition_id=p_id)) t),
 'players',(select coalesce(jsonb_agg(to_jsonb(p) order by p.name),'[]'::jsonb) from
   (select id,team_id,name,number,position,active from public.fm_players where team_id in(select team_id from public.fm_entries where competition_id=p_id)) p),
 'matches',(select coalesce(jsonb_agg(to_jsonb(m) order by m.kickoff nulls last),'[]'::jsonb) from
   (select id,competition_id,home_id,away_id,kickoff,venue,round,stage,group_name,status,obs_home_score,obs_away_score,obs_synced_at,
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
