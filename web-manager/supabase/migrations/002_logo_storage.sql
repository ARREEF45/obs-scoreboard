-- Private logos: only the signed-in owner can upload and download originals.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fm-logos','fm-logos',false,5242880,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy fm_logo_read on storage.objects for select to authenticated using(bucket_id='fm-logos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy fm_logo_upload on storage.objects for insert to authenticated with check(bucket_id='fm-logos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy fm_logo_delete on storage.objects for delete to authenticated using(bucket_id='fm-logos' and (storage.foldername(name))[1]=(select auth.uid())::text);
