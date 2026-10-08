-- Run after 004. Existing competitions remain standalone leagues.
begin;
alter table public.fm_competitions
 add column series_key uuid,
 add column parent_id uuid,
 add column format text not null default 'league' check(format in ('league','knockout','groups')),
 add column starts_on date,
 add column ends_on date,
 add column advance_to uuid,
 add column advance_count integer not null default 1 check(advance_count between 1 and 128),
 add column group_count integer not null default 2 check(group_count between 2 and 64),
 add column tournament_state jsonb not null default '{}',
 add column qualification_rules text not null default '' check(length(qualification_rules)<=5000),
 add foreign key(parent_id,owner_id) references public.fm_competitions(id,owner_id),
 add foreign key(advance_to,owner_id) references public.fm_competitions(id,owner_id),
 add check(parent_id is distinct from id and advance_to is distinct from id),
 add check(ends_on is null or starts_on is null or ends_on>=starts_on);
create unique index fm_unique_season on public.fm_competitions(owner_id,series_key,season) where series_key is not null and parent_id is null;
alter table public.fm_matches add column stage text not null default 'league' check(stage in ('league','group','knockout')), add column group_name text not null default '';

create function public.fm_check_competition_structure() returns trigger language plpgsql set search_path='' as $$
declare ancestor uuid; seen uuid[]:=array[new.id];
begin
 ancestor:=new.parent_id;
 while ancestor is not null loop
  if ancestor=any(seen) then raise exception 'Circular competition hierarchy';end if;
  seen:=array_append(seen,ancestor);
  select parent_id into ancestor from public.fm_competitions where id=ancestor and owner_id=new.owner_id;
 end loop;
 if new.parent_id is not null and exists(select 1 from public.fm_competitions where id=new.parent_id and season<>new.season) then raise exception 'Parent season must match';end if;
 ancestor:=new.advance_to;seen:=array[new.id];
 while ancestor is not null loop
  if ancestor=any(seen) then raise exception 'Circular qualification route';end if;
  seen:=array_append(seen,ancestor);
  select advance_to into ancestor from public.fm_competitions where id=ancestor and owner_id=new.owner_id;
 end loop;
 if new.advance_to is not null and exists(select 1 from public.fm_competitions where id=new.advance_to and season<>new.season) then raise exception 'Destination season must match';end if;
 if tg_op='UPDATE' and new.season<>old.season and exists(select 1 from public.fm_competitions where parent_id=old.id) then raise exception 'Create a new season instead of changing a parent season';end if;
 if new.series_key is not null and length(trim(new.season))=0 then raise exception 'Season is required';end if;
 if tg_op='UPDATE' and (new.format<>old.format or new.group_count<>old.group_count or new.parent_id is distinct from old.parent_id or new.season<>old.season) and exists(select 1 from public.fm_matches where competition_id=old.id) then
  raise exception 'Cannot change competition structure after fixtures exist';
 end if;
 return new;
end $$;
create trigger fm_structure before insert or update on public.fm_competitions for each row execute function public.fm_check_competition_structure();

-- Admission is an explicit organiser decision, not a guess based on tied tables.
create function public.fm_advance_teams(p_source uuid,p_version integer,p_teams uuid[]) returns void language plpgsql security invoker set search_path='' as $$
declare c public.fm_competitions;
begin
 select * into c from public.fm_competitions where id=p_source and owner_id=auth.uid() for update;
 if not found or c.version<>p_version then raise exception 'Competition changed; refresh';end if;
 if c.advance_to is null then raise exception 'Choose a destination competition';end if;
 perform 1 from public.fm_competitions where id=c.advance_to and owner_id=auth.uid() for update;
 if not found then raise exception 'Destination not found';end if;
 if exists(select 1 from public.fm_matches where competition_id=c.advance_to) then raise exception 'Destination already has fixtures';end if;
 if not exists(select 1 from public.fm_matches where competition_id=c.id) or exists(select 1 from public.fm_matches where competition_id=c.id and status not in ('finished','cancelled')) then raise exception 'Complete source fixtures before confirming qualifiers';end if;
 if coalesce(cardinality(p_teams),0)<>c.advance_count or (select count(distinct x) from unnest(p_teams) x)<>c.advance_count then raise exception 'Invalid qualifier count';end if;
 if exists(select 1 from unnest(p_teams) x where not exists(select 1 from public.fm_entries where competition_id=c.id and team_id=x and owner_id=auth.uid())) then raise exception 'Team not registered in source';end if;
 insert into public.fm_entries(competition_id,team_id) select c.advance_to,x from unnest(p_teams) x on conflict(competition_id,team_id,owner_id) do nothing;
end $$;

create function public.fm_save_schedule(p_id uuid,p_version integer,p_rows jsonb,p_state jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare c public.fm_competitions; r jsonb;
begin
 select * into c from public.fm_competitions where id=p_id and owner_id=auth.uid() for update;
 if not found or c.version<>p_version then raise exception 'Competition changed; refresh';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 10000 or jsonb_typeof(p_state)<>'object' then raise exception 'Invalid schedule';end if;
 if c.tournament_state='{}'::jsonb and exists(select 1 from public.fm_matches where competition_id=p_id) then raise exception 'Fixtures already exist';end if;
 if coalesce((p_state->>'round')::integer,0)<=coalesce((c.tournament_state->>'round')::integer,0) then raise exception 'Round already created';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  insert into public.fm_matches(competition_id,home_id,away_id,round,kickoff,venue,stage,group_name)
  values(p_id,(r->>'home_id')::uuid,(r->>'away_id')::uuid,(r->>'round')::integer,(r->>'kickoff')::timestamptz,coalesce(r->>'venue',''),r->>'stage',coalesce(r->>'group_name',''));
 end loop;
 update public.fm_competitions set tournament_state=p_state where id=p_id;
end $$;

create function public.fm_copy_season(p_id uuid,p_season text,p_copy_teams boolean) returns uuid language plpgsql security invoker set search_path='' as $$
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
  insert into public.fm_competitions(name,season,win_points,draw_points,loss_points,series_key,parent_id,format,advance_count,group_count,qualification_rules)
  values(item.name,trim(p_season),item.win_points,item.draw_points,item.loss_points,case when item.id=c.id then key else null end,(ids->>item.parent_id::text)::uuid,item.format,item.advance_count,item.group_count,item.qualification_rules) returning id into new_id;
  ids:=ids||jsonb_build_object(item.id::text,new_id);
  if p_copy_teams then insert into public.fm_entries(competition_id,team_id) select new_id,team_id from public.fm_entries where competition_id=item.id;end if;
 end loop;
 for item in select * from public.fm_competitions where id in(select x::uuid from jsonb_object_keys(ids) x) loop
  if ids ? item.advance_to::text then update public.fm_competitions set advance_to=(ids->>item.advance_to::text)::uuid where id=(ids->>item.id::text)::uuid;end if;
 end loop;
 return (ids->>c.id::text)::uuid;
end $$;
revoke all on function public.fm_advance_teams(uuid,integer,uuid[]),public.fm_save_schedule(uuid,integer,jsonb,jsonb),public.fm_copy_season(uuid,text,boolean) from public,anon;
grant execute on function public.fm_advance_teams(uuid,integer,uuid[]),public.fm_save_schedule(uuid,integer,jsonb,jsonb),public.fm_copy_season(uuid,text,boolean) to authenticated;
create or replace function public.fm_public_competitions() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(c) order by c.name),'[]'::jsonb) from
 (select id,name,season,parent_id,format from public.fm_competitions where is_public) c;
$$;
create or replace function public.fm_public_competition(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare output jsonb;
begin
 if not exists(select 1 from public.fm_competitions where id=p_id and is_public) then return null;end if;
 select jsonb_build_object(
 'competition',(select to_jsonb(c) from (select id,name,season,parent_id,format,starts_on,ends_on,qualification_rules,win_points,draw_points,loss_points from public.fm_competitions where id=p_id) c),
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
