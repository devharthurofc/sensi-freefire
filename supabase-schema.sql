-- ============================================================
--  SENSI PRO · tabela de dados no Supabase
--
--  Como usar (apenas em um projeto NOVO do Supabase):
--   1. Abra seu projeto em https://supabase.com
--   2. Menu lateral: SQL Editor -> New query
--   3. Cole TODO este arquivo e clique em RUN
--
--  Obs: o projeto atual já possui a tabela `app_data`.
-- ============================================================

create table if not exists public.app_data (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now()
);

insert into public.app_data (id, data)
values ('db', '{}'::jsonb)
on conflict (id) do nothing;
