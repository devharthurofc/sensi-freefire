create table if not exists public.vendas (
  id text primary key default gen_random_uuid()::text,
  key_code text not null default '',
  buyer_label text default '',
  buyer_contact text default '',
  price numeric(10,2) default 0,
  payment_method text default '',
  status text default 'pago',
  seller_admin_name text default '',
  notes text default '',
  sold_at timestamptz not null default now()
);

create index if not exists idx_vendas_sold_at on public.vendas(sold_at);
create index if not exists idx_vendas_status on public.vendas(status);

alter table public.vendas enable row level security;

create policy "Admin full access" on public.vendas
  for all using (true) with check (true);
