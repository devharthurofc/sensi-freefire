-- ============================================================
--  AIMZY · SCHEMA COMPLETO
--  Execute no Supabase (SQL Editor → New query → RUN)
-- ============================================================

-- TABELA DE VENDAS
create table if not exists public.sales (
  id text primary key,
  key_id text,
  key_code text not null default '',
  price numeric(10,2) default 0,
  buyer_label text default '',
  buyer_contact text default '',
  product text default '',
  plan text default '',
  payment_method text default '',
  seller_admin_id text default '',
  seller_admin_name text default '',
  sold_at timestamptz not null default now(),
  notes text default '',
  status text default 'pago'
);

create index if not exists idx_sales_sold_at on public.sales(sold_at);
create index if not exists idx_sales_status on public.sales(status);
create index if not exists idx_sales_key_code on public.sales(key_code);
create index if not exists idx_sales_product on public.sales(product);

-- TABELA DE PRODUTOS
create table if not exists public.products (
  id text primary key,
  name text not null default '',
  description text default '',
  active boolean default true,
  plans jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_active on public.products(active);

-- PERMISSÕES
alter table public.sales enable row level security;
alter table public.products enable row level security;

create policy "Admin full access sales" on public.sales
  for all using (true) with check (true);

create policy "Admin full access products" on public.products
  for all using (true) with check (true);
