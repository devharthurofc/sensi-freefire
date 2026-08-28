-- Tabela de vendas: persiste a compra (comprovante + plano + validade).
-- Fluxo: cliente registra compra via POST /api/sales -> venda 'pendente' com
-- receipt (base64), plan, plan_type, expires_at, buyer_contact.
-- O admin aprova (PATCH /api/admin/sales/:id status='pago') e o sistema gera
-- uma KEY expirando no plano escolhido.
create table if not exists public.vendas (
  id text primary key default gen_random_uuid()::text,
  key_code text not null default '',
  buyer_label text default '',
  buyer_contact text default '',
  price numeric(10,2) default 0,
  payment_method text default '',
  status text default 'pendente',
  seller_admin_id text default '',
  seller_admin_name text default '',
  plan text default '',
  plan_type text default '',
  expires_at timestamptz,
  receipt text default '',
  notes text default '',
  paid_at timestamptz,
  sold_at timestamptz not null default now()
);

create index if not exists idx_vendas_sold_at on public.vendas(sold_at);
create index if not exists idx_vendas_status on public.vendas(status);
create index if not exists idx_vendas_buyer_contact on public.vendas(buyer_contact);
create index if not exists idx_vendas_paid_at on public.vendas(paid_at);
create index if not exists idx_vendas_buyer_contact on public.vendas(buyer_contact);
create index if not exists idx_vendas_paid_at on public.vendas(paid_at);


alter table public.vendas enable row level security;

create policy "Admin full access" on public.vendas
  for all using (true) with check (true);
