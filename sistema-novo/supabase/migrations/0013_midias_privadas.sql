-- Sem policy de navegador: a Edge Function valida sessão, conversa e RLS antes de assinar.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crm-midias','crm-midias',false,20971520,array['image/jpeg','image/png','image/webp','video/mp4','audio/ogg','audio/mpeg','audio/mp4','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
