-- Run after 006. Deletion removes competition data, not the shared team/player library.
begin;
create function public.fm_competition_delete_preview(p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ids uuid[];
begin
 if not exists(select 1 from public.fm_competitions where id=p_id and owner_id=auth.uid()) then raise exception 'Competition not found';end if;
 with recursive tree as (
  select id from public.fm_competitions where id=p_id and owner_id=auth.uid()
  union select c.id from public.fm_competitions c join tree t on c.parent_id=t.id where c.owner_id=auth.uid()
 ) select array_agg(id) into ids from tree;
 return jsonb_build_object(
  'competitions',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb) from public.fm_competitions c where id=any(ids)),
  'matches',(select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb) from public.fm_matches m where competition_id=any(ids)),
  'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.fm_entries e where competition_id=any(ids)),
  'lineups',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]'::jsonb) from public.fm_lineups l where match_id in(select id from public.fm_matches where competition_id=any(ids))),
  'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.fm_events e where match_id in(select id from public.fm_matches where competition_id=any(ids))),
  'incoming',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb) from public.fm_competitions c where advance_to=any(ids) and not(id=any(ids)))
 );
end $$;

create function public.fm_delete_competition(p_id uuid,p_expected jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare ids uuid[]; current_data jsonb;
begin
 perform 1 from public.fm_competitions where id=p_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Competition not found';end if;
 current_data:=public.fm_competition_delete_preview(p_id);
 select array_agg((x->>'id')::uuid) into ids from jsonb_array_elements(current_data->'competitions') x;
 perform 1 from public.fm_competitions where id=any(ids) or advance_to=any(ids) order by id for update;
 perform 1 from public.fm_matches where competition_id=any(ids) order by id for update;
 perform 1 from public.fm_entries where competition_id=any(ids) order by id for update;
 perform 1 from public.fm_lineups where match_id in(select id from public.fm_matches where competition_id=any(ids)) order by id for update;
 perform 1 from public.fm_events where match_id in(select id from public.fm_matches where competition_id=any(ids)) order by id for update;
 current_data:=public.fm_competition_delete_preview(p_id);
 if p_expected is null or current_data is distinct from p_expected then raise exception 'DELETE_CONFLICT: competition changed; preview again';end if;
 -- FK checks block concurrent additions; any conflict rolls back the entire transaction.
 update public.fm_competitions set advance_to=null where advance_to=any(ids) and not(id=any(ids));
 delete from public.fm_events where match_id in(select id from public.fm_matches where competition_id=any(ids));
 delete from public.fm_lineups where match_id in(select id from public.fm_matches where competition_id=any(ids));
 delete from public.fm_matches where competition_id=any(ids);
 delete from public.fm_entries where competition_id=any(ids);
 delete from public.fm_competitions where id=any(ids);
end $$;
revoke all on function public.fm_competition_delete_preview(uuid),public.fm_delete_competition(uuid,jsonb) from public,anon;
grant execute on function public.fm_competition_delete_preview(uuid),public.fm_delete_competition(uuid,jsonb) to authenticated;
commit;
