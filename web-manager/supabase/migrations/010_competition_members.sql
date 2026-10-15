-- Run after 009. Preserves existing owners and data; no account is reassigned.
begin;
create table public.fm_competition_members (
 competition_id uuid not null references public.fm_competitions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 added_at timestamptz not null default now(), primary key(competition_id,user_id)
);
create index on public.fm_competition_members(user_id);
create table public.fm_competition_invites (
 competition_id uuid not null references public.fm_competitions(id) on delete cascade,
 email text not null check(email=lower(trim(email)) and length(email)<=254 and email like '%_@_%._%'),
 created_at timestamptz not null default now(), primary key(competition_id,email)
);
alter table public.fm_competition_members enable row level security;
alter table public.fm_competition_invites enable row level security;
revoke all on public.fm_competition_members,public.fm_competition_invites from public,anon,authenticated;

create function public.fm_can_manage(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.fm_competitions c where c.id=p_id and
 (c.owner_id=auth.uid() or exists(select 1 from public.fm_competition_members m where m.competition_id=c.id and m.user_id=auth.uid())));
$$;
create function public.fm_can_read_team(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.fm_teams t where t.id=p_id and
 (t.owner_id=auth.uid() or exists(select 1 from public.fm_entries e where e.team_id=t.id and public.fm_can_manage(e.competition_id))));
$$;
create function public.fm_can_manage_match(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.fm_matches m where m.id=p_id and public.fm_can_manage(m.competition_id));
$$;

-- Only the creator can grant/revoke access. Never trust client-supplied user metadata.
create function public.fm_add_competition_member(p_id uuid,p_email text) returns text language plpgsql security definer set search_path='' as $$
declare email_normal text:=lower(trim(p_email)); target uuid; creator uuid;
begin
 select owner_id into creator from public.fm_competitions where id=p_id for update;
 if creator is distinct from auth.uid() or auth.uid() is null then raise exception 'OWNER_ONLY';end if;
 if email_normal is null or length(email_normal)>254 or email_normal not like '%_@_%._%' then raise exception 'INVALID_EMAIL';end if;
 select id into target from auth.users where lower(email)=email_normal and email_confirmed_at is not null;
 if target=creator then raise exception 'ALREADY_OWNER';end if;
 if target is not null then
  insert into public.fm_competition_members(competition_id,user_id) values(p_id,target) on conflict do nothing;
  delete from public.fm_competition_invites where competition_id=p_id and email=email_normal;
  return 'added';
 end if;
 insert into public.fm_competition_invites(competition_id,email) values(p_id,email_normal) on conflict do nothing;
 return 'pending';
end $$;
create function public.fm_accept_competition_invites() returns void language plpgsql security definer set search_path='' as $$
declare verified_email text;
begin
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null then return;end if;
 -- Lock pending rows so concurrent acceptance/removal cannot restore revoked access.
 perform 1 from public.fm_competition_invites where email=verified_email for update;
 insert into public.fm_competition_members(competition_id,user_id)
 select i.competition_id,auth.uid() from public.fm_competition_invites i join public.fm_competitions c on c.id=i.competition_id
 where i.email=verified_email and c.owner_id<>auth.uid() on conflict do nothing;
 delete from public.fm_competition_invites where email=verified_email;
end $$;
create function public.fm_list_competition_members(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.fm_competitions where id=p_id and owner_id=auth.uid()) then raise exception 'OWNER_ONLY';end if;
 return jsonb_build_object(
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email) order by m.added_at),'[]'::jsonb) from public.fm_competition_members m join auth.users u on u.id=m.user_id where m.competition_id=p_id),
 'pending',(select coalesce(jsonb_agg(jsonb_build_object('email',email) order by created_at),'[]'::jsonb) from public.fm_competition_invites where competition_id=p_id));
end $$;
create function public.fm_remove_competition_member(p_id uuid,p_user uuid default null,p_email text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.fm_competitions where id=p_id and owner_id=auth.uid() for update;
 if not found then raise exception 'OWNER_ONLY';end if;
 delete from public.fm_competition_invites where competition_id=p_id and email=lower(trim(p_email));
 delete from public.fm_competition_members where competition_id=p_id and (user_id=p_user or user_id in(select id from auth.users where lower(email)=lower(trim(p_email))));
end $$;

-- Competition-scoped rows keep the competition owner's namespace for existing composite FKs.
create function public.fm_scope_owner() returns trigger language plpgsql security invoker set search_path='' as $$
declare scoped_owner uuid;
begin
 if tg_op='UPDATE' and new.owner_id is distinct from old.owner_id then raise exception 'OWNER_IMMUTABLE';end if;
 if tg_op='INSERT' and tg_table_name in ('fm_entries','fm_matches') then
  select owner_id into scoped_owner from public.fm_competitions where id=new.competition_id;
  if scoped_owner is null then raise exception 'COMPETITION_ACCESS_DENIED';end if;
  new.owner_id:=scoped_owner;
 elsif tg_op='INSERT' and tg_table_name in ('fm_lineups','fm_events') then
  select owner_id into scoped_owner from public.fm_matches where id=new.match_id;
  if scoped_owner is null then raise exception 'MATCH_ACCESS_DENIED';end if;
  new.owner_id:=scoped_owner;
 end if;
 if tg_table_name='fm_competitions' then
  if tg_op='UPDATE' and old.owner_id<>auth.uid() and
   (new.parent_id is distinct from old.parent_id or new.advance_to is distinct from old.advance_to or new.series_key is distinct from old.series_key or new.season<>old.season or new.is_public<>old.is_public) then raise exception 'OWNER_ONLY';end if;
  if tg_op='INSERT' and new.parent_id is not null and not exists(select 1 from public.fm_competitions where id=new.parent_id and owner_id=auth.uid()) then raise exception 'OWNER_ONLY';end if;
 end if;
 return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['fm_teams','fm_players','fm_competitions','fm_entries','fm_matches','fm_lineups','fm_events'] loop
  execute format('create trigger aa_scope_owner before insert or update on public.%I for each row execute function public.fm_scope_owner()',t);
 end loop;
end $$;
drop policy own_rows on public.fm_competitions;
create policy competition_read on public.fm_competitions for select to authenticated using(owner_id=auth.uid() or public.fm_can_manage(id));
create policy competition_insert on public.fm_competitions for insert to authenticated with check(owner_id=auth.uid());
create policy competition_update on public.fm_competitions for update to authenticated using(public.fm_can_manage(id)) with check(public.fm_can_manage(id));
create policy competition_delete on public.fm_competitions for delete to authenticated using(owner_id=auth.uid());
create policy team_shared_read on public.fm_teams for select to authenticated using(public.fm_can_read_team(id));
create policy player_shared_read on public.fm_players for select to authenticated using(public.fm_can_read_team(team_id));
do $$ declare t text;begin
 foreach t in array array['fm_entries','fm_matches'] loop
  execute format('drop policy own_rows on public.%I',t);
  execute format('create policy competition_access on public.%I for all to authenticated using(public.fm_can_manage(competition_id)) with check(public.fm_can_manage(competition_id))',t);
 end loop;
 foreach t in array array['fm_lineups','fm_events'] loop
  execute format('drop policy own_rows on public.%I',t);
  execute format('create policy match_access on public.%I for all to authenticated using(public.fm_can_manage_match(match_id)) with check(public.fm_can_manage_match(match_id))',t);
 end loop;
end $$;
-- Shared access is to enrolled teams only, never the creator's entire team library.
-- Catalogue edits remain with their owner because a team can belong to unrelated competitions.
do $$ begin
 if to_regclass('storage.objects') is not null then
  execute 'create policy fm_logo_member_read on storage.objects for select to authenticated using(bucket_id=''fm-logos'' and exists(select 1 from public.fm_teams t where t.logo_path=storage.objects.name and public.fm_can_read_team(t.id)))';
 end if;
end $$;

revoke all on function public.fm_can_manage(uuid),public.fm_can_read_team(uuid),public.fm_can_manage_match(uuid),public.fm_add_competition_member(uuid,text),public.fm_accept_competition_invites(),public.fm_list_competition_members(uuid),public.fm_remove_competition_member(uuid,uuid,text) from public,anon;
grant execute on function public.fm_can_manage(uuid),public.fm_can_read_team(uuid),public.fm_can_manage_match(uuid),public.fm_add_competition_member(uuid,text),public.fm_accept_competition_invites(),public.fm_list_competition_members(uuid),public.fm_remove_competition_member(uuid,uuid,text) to authenticated;
-- Existing invoker RPCs are replaced below to use the new RLS rather than owner-only filters.

create or replace function public.fm_save_lineup(p_match uuid,p_team uuid,p_players jsonb,p_expected jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb;current_selection jsonb;begin
 perform 1 from public.fm_matches where id=p_match for update;
 if not found then raise exception 'Match not found';end if;
 select coalesce(jsonb_agg(jsonb_build_object('player_id',player_id,'role',role) order by player_id),'[]'::jsonb) into current_selection from public.fm_lineups where match_id=p_match and team_id=p_team;
 if current_selection is distinct from p_expected then raise exception 'Lineup changed on another device; reload before saving';end if;
 delete from public.fm_lineups where match_id=p_match and team_id=p_team and player_id not in (select (value->>'player_id')::uuid from jsonb_array_elements(p_players));
 -- Demote existing starters first, so swapping eleven starters remains atomic.
 update public.fm_lineups set role='substitute' where match_id=p_match and team_id=p_team;
 for item in select * from jsonb_array_elements(p_players) loop
 insert into public.fm_lineups(match_id,team_id,player_id,role) values(p_match,p_team,(item->>'player_id')::uuid,item->>'role')
 on conflict(match_id,player_id,owner_id) do update set role=excluded.role;
 end loop;
end $$;


create or replace function public.fm_sync_broadcast_result(p_match uuid, p_expected_version integer, p_result jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.fm_matches; h integer; a integer; next_status text;
begin
 select * into m from public.fm_matches where id=p_match for update;
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
 where id=p_match returning * into m;
 return jsonb_build_object('version',m.version,'synced_at',m.obs_synced_at);
end $$;


create or replace function public.fm_save_schedule(p_id uuid,p_version integer,p_rows jsonb,p_state jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare c public.fm_competitions; r jsonb;
begin
 select * into c from public.fm_competitions where id=p_id for update;
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


create or replace function public.fm_advance_teams(p_source uuid,p_version integer,p_teams uuid[]) returns void language plpgsql security invoker set search_path='' as $$
declare c public.fm_competitions;
begin
 select * into c from public.fm_competitions where id=p_source for update;
 if not found or c.version<>p_version then raise exception 'Competition changed; refresh';end if;
 if c.advance_to is null then raise exception 'Choose a destination competition';end if;
 perform 1 from public.fm_competitions where id=c.advance_to for update;
 if not found then raise exception 'Destination not found';end if;
 if exists(select 1 from public.fm_matches where competition_id=c.advance_to) then raise exception 'Destination already has fixtures';end if;
 if not exists(select 1 from public.fm_matches where competition_id=c.id) or exists(select 1 from public.fm_matches where competition_id=c.id and status not in ('finished','cancelled')) then raise exception 'Complete source fixtures before confirming qualifiers';end if;
 if coalesce(cardinality(p_teams),0)<>c.advance_count or (select count(distinct x) from unnest(p_teams) x)<>c.advance_count then raise exception 'Invalid qualifier count';end if;
 if exists(select 1 from unnest(p_teams) x where not exists(select 1 from public.fm_entries where competition_id=c.id and team_id=x)) then raise exception 'Team not registered in source';end if;
 insert into public.fm_entries(competition_id,team_id) select c.advance_to,x from unnest(p_teams) x on conflict(competition_id,team_id,owner_id) do nothing;
update public.fm_competitions set tournament_state=tournament_state||jsonb_build_object('external_qualifiers',to_jsonb(p_teams)) where id=p_source;
end $$;


commit;
