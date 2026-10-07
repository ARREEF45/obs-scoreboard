-- Run once in Supabase SQL Editor. No existing scoreboard tables are modified.
begin;
create table public.fm_teams (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null check(length(trim(name))>0), logo_path text not null default '', coach text not null default '',
 home_color text not null default '#1d4ed8' check(home_color ~ '^#[0-9a-fA-F]{6}$'),
 away_color text not null default '#dc2626' check(away_color ~ '^#[0-9a-fA-F]{6}$'),
 archived boolean not null default false, version integer not null default 1,
 updated_at timestamptz not null default now(), unique(id,owner_id), unique(owner_id,name)
);
create table public.fm_players (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 team_id uuid not null, name text not null check(length(trim(name))>0), number text not null default '',
 position text not null default '', active boolean not null default true,
 version integer not null default 1, updated_at timestamptz not null default now(),
 foreign key(team_id,owner_id) references public.fm_teams(id,owner_id), unique(id,owner_id),unique(id,team_id,owner_id)
);
create table public.fm_competitions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null check(length(trim(name))>0), season text not null default '',
 win_points integer not null default 3 check(win_points>=0), draw_points integer not null default 1 check(draw_points>=0), loss_points integer not null default 0 check(loss_points>=0),
 version integer not null default 1, updated_at timestamptz not null default now(),unique(id,owner_id)
);
create table public.fm_entries (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 competition_id uuid not null, team_id uuid not null,
 foreign key(competition_id,owner_id) references public.fm_competitions(id,owner_id),
 foreign key(team_id,owner_id) references public.fm_teams(id,owner_id), unique(competition_id,team_id,owner_id)
);
create table public.fm_matches (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),
 competition_id uuid not null, home_id uuid not null, away_id uuid not null,
 kickoff timestamptz, venue text not null default '', round integer not null default 1 check(round>0),
 status text not null default 'scheduled' check(status in ('scheduled','live','finished','postponed','cancelled')),
 version integer not null default 1, updated_at timestamptz not null default now(),
 check(home_id<>away_id),unique(id,owner_id),unique(competition_id,round,home_id,away_id,owner_id),
 foreign key(competition_id,home_id,owner_id) references public.fm_entries(competition_id,team_id,owner_id),
 foreign key(competition_id,away_id,owner_id) references public.fm_entries(competition_id,team_id,owner_id)
);
create table public.fm_lineups (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),
 match_id uuid not null,team_id uuid not null,player_id uuid not null,
 role text not null check(role in ('starter','substitute')),
 foreign key(match_id,owner_id) references public.fm_matches(id,owner_id),
 foreign key(player_id,team_id,owner_id) references public.fm_players(id,team_id,owner_id),
 unique(match_id,player_id,owner_id)
);
create table public.fm_events (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),
 match_id uuid not null,team_id uuid not null,player_id uuid,assist_id uuid,
 kind text not null check(kind in ('goal','own_goal','yellow','second_yellow','red')),
 minute integer not null default 0 check(minute between 0 and 180),added integer not null default 0 check(added between 0 and 60),
 version integer not null default 1,updated_at timestamptz not null default now(),
 foreign key(match_id,owner_id) references public.fm_matches(id,owner_id),
 foreign key(team_id,owner_id) references public.fm_teams(id,owner_id),
 foreign key(match_id,player_id,owner_id) references public.fm_lineups(match_id,player_id,owner_id),
 foreign key(match_id,assist_id,owner_id) references public.fm_lineups(match_id,player_id,owner_id),
 check(assist_id is null or (kind='goal' and player_id is not null and assist_id<>player_id)),
 check(kind in ('goal','own_goal') or player_id is not null)
);
create function public.fm_version() returns trigger language plpgsql set search_path='' as $$
begin new.version=old.version+1;new.updated_at=now();return new;end $$;
create function public.fm_validate_match_child() returns trigger language plpgsql set search_path='' as $$
declare m public.fm_matches; participant_team uuid;
begin
 select * into m from public.fm_matches where id=new.match_id and owner_id=new.owner_id for update;
 if not found or new.team_id not in (m.home_id,m.away_id) then raise exception 'Team is not in this match';end if;
 if tg_table_name='fm_lineups' then
   if new.role='starter' and (select count(*) from public.fm_lineups where match_id=new.match_id and team_id=new.team_id and role='starter' and id<>new.id)>=11 then raise exception 'Maximum 11 starters';end if;
 else
   if new.player_id is not null then
     select team_id into participant_team from public.fm_lineups where match_id=new.match_id and player_id=new.player_id and owner_id=new.owner_id;
     if participant_team is distinct from new.team_id then raise exception 'Player is not selected for this team';end if;
   end if;
   if new.assist_id is not null then
     select team_id into participant_team from public.fm_lineups where match_id=new.match_id and player_id=new.assist_id and owner_id=new.owner_id;
     if participant_team is distinct from new.team_id then raise exception 'Assist must belong to the scoring team';end if;
   end if;
 end if;return new;
end $$;
create trigger fm_lineup_validate before insert or update on public.fm_lineups for each row execute function public.fm_validate_match_child();
create trigger fm_event_validate before insert or update on public.fm_events for each row execute function public.fm_validate_match_child();
create function public.fm_protect_match_teams() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.home_id<>old.home_id or new.away_id<>old.away_id or new.competition_id<>old.competition_id) and (exists(select 1 from public.fm_lineups where match_id=old.id) or exists(select 1 from public.fm_events where match_id=old.id)) then raise exception 'Remove lineups and events before changing match teams';end if;
 return new;
end $$;
create trigger fm_match_teams before update on public.fm_matches for each row execute function public.fm_protect_match_teams();
do $$ declare t text;begin
 foreach t in array array['fm_teams','fm_players','fm_competitions','fm_entries','fm_matches','fm_lineups','fm_events'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('create policy own_rows on public.%I for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()))',t);
   execute format('grant select,insert,update,delete on public.%I to authenticated',t);
   execute format('revoke all on public.%I from anon',t);
   execute format('create index on public.%I(owner_id)',t);
 end loop;
 foreach t in array array['fm_teams','fm_players','fm_competitions','fm_matches','fm_events'] loop
   execute format('create trigger version_update before update on public.%I for each row execute function public.fm_version()',t);
 end loop;
end $$;
create function public.fm_save_lineup(p_match uuid,p_team uuid,p_players jsonb,p_expected jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb;current_selection jsonb;begin
 perform 1 from public.fm_matches where id=p_match and owner_id=auth.uid() for update;
 if not found then raise exception 'Match not found';end if;
 select coalesce(jsonb_agg(jsonb_build_object('player_id',player_id,'role',role) order by player_id),'[]'::jsonb) into current_selection from public.fm_lineups where match_id=p_match and team_id=p_team and owner_id=auth.uid();
 if current_selection is distinct from p_expected then raise exception 'Lineup changed on another device; reload before saving';end if;
 delete from public.fm_lineups where match_id=p_match and team_id=p_team and owner_id=auth.uid() and player_id not in (select (value->>'player_id')::uuid from jsonb_array_elements(p_players));
 -- Demote existing starters first, so swapping eleven starters remains atomic.
 update public.fm_lineups set role='substitute' where match_id=p_match and team_id=p_team and owner_id=auth.uid();
 for item in select * from jsonb_array_elements(p_players) loop
 insert into public.fm_lineups(match_id,team_id,player_id,role) values(p_match,p_team,(item->>'player_id')::uuid,item->>'role')
 on conflict(match_id,player_id,owner_id) do update set role=excluded.role;
 end loop;
end $$;
revoke all on function public.fm_save_lineup(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.fm_save_lineup(uuid,uuid,jsonb,jsonb) to authenticated;
create function public.fm_import_team(p_team jsonb,p_players jsonb) returns public.fm_teams language plpgsql security invoker set search_path='' as $$
declare saved public.fm_teams;item jsonb;begin
 insert into public.fm_teams(name,coach,home_color,away_color,logo_path) values(p_team->>'name',coalesce(p_team->>'coach',''),p_team->>'home_color',p_team->>'away_color',coalesce(p_team->>'logo_path','')) returning * into saved;
 for item in select * from jsonb_array_elements(p_players) loop
 insert into public.fm_players(team_id,name,number,position) values(saved.id,item->>'name',coalesce(item->>'number',''),coalesce(item->>'position',''));
 end loop;
 return saved;
end $$;
revoke all on function public.fm_import_team(jsonb,jsonb) from public,anon;
grant execute on function public.fm_import_team(jsonb,jsonb) to authenticated;
commit;
