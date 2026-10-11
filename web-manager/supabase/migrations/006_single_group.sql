-- Run after 005_competition_structure.sql. Existing group counts stay unchanged.
begin;
alter table public.fm_competitions
 drop constraint if exists fm_competitions_group_count_check;
alter table public.fm_competitions
 add constraint fm_competitions_group_count_check check(group_count between 1 and 64),
 alter column group_count set default 1;
commit;
