-- Execute este SQL no Supabase (SQL Editor -> New query -> RUN)
-- Isso cria a tabela de vendas necessária para o sistema

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

create index if not exists idx_sales_sold_at on public.sales(sold_at);
create index if not exists idx_sales_status on public.sales(status);
create index if not exists idx_sales_key_code on public.sales(key_code);
