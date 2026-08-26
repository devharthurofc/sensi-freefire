-- ============================================================
--  SENSI PRO · schema completo no Supabase
--
--  Como usar:
--   1. Abra seu projeto em https://supabase.com
--   2. Menu lateral: SQL Editor -> New query
--   3. Cole TODO este arquivo e clique em RUN
--
--  IMPORTANTE: Execute este arquivo UMA VEZ só.
--  Se já tem tabelas antigas, execute apenas a seção de SALES.
-- ============================================================

-- Tabela principal (backup legado)
create table if not exists public.app_data (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now()
);

insert into public.app_data (id, data)
values ('db', '{}'::jsonb)
on conflict (id) do nothing;

-- Tabela de vendas (NOVA)
create table if not exists public.sales (
  id text primary key,
  key_id text,
  key_code text not null default '',
  price numeric(10,2) default 0,
  buyer_label text default '',
  buyer_contact text default '',
  seller_admin_id text default '',
  seller_admin_name text default '',
  sold_at timestamptz not null default now(),
  notes text default '',
  status text default 'pago'
);

-- Índices para performance
create index if not exists idx_sales_sold_at on public.sales(sold_at);
create index if not exists idx_sales_status on public.sales(status);
create index if not exists idx_sales_key_code on public.sales(key_code);
