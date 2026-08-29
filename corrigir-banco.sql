-- ============================================================
--  AIMZY · CORREÇÃO DO BANCO (execute no Supabase SQL Editor)
--  Cria a tabela accounts e garante colunas usadas pelo sistema.
-- ============================================================

-- 1) Contas (e-mail / senha)
create table if not exists public.accounts (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  user_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_accounts_email on public.accounts(email);
create index if not exists idx_accounts_user_id on public.accounts(user_id);

alter table public.accounts enable row level security;
drop policy if exists "Server full access accounts" on public.accounts;
create policy "Server full access accounts" on public.accounts
  for all using (true) with check (true);

-- 2) Colunas extras da tabela settings
alter table public.settings add column if not exists announcement jsonb;
alter table public.settings add column if not exists prices jsonb default '{}'::jsonb;
alter table public.settings add column if not exists admin_panel_path text default '';
alter table public.settings add column if not exists plans jsonb default '[]'::jsonb;

-- 3) Coluna type na tabela keys (Premium / Proibida)
alter table public.keys add column if not exists type text default 'premium';

-- Tipo de acesso salvo no usuário. É necessário para liberar corretamente
-- Premium ou VIP quando a pessoa entra em outro celular.
alter table public.users add column if not exists vip_type text default 'premium';

-- 3.1) Colunas para o novo fluxo: KEY só conta o tempo quando o cliente ativa
--      - plan: nome do plano vendido (ex: "7 Dias", "1 Hora")
--      - plan_type: tipo (premium | proibida)
--      - duration: duração bruta (ex: "7d", "1h", "30d", "permanent")
--      - status já existe (text) — passa a aceitar também 'aguardando'
alter table public.keys add column if not exists plan text default '';
alter table public.keys add column if not exists plan_type text default '';
alter table public.keys add column if not exists duration text default '';

-- 4) Tabela de produtos (caso ainda não exista)
create table if not exists public.products (
  id text primary key,
  name text not null default '',
  description text default '',
  active boolean default true,
  plans jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
drop policy if exists "Admin full access products" on public.products;
create policy "Admin full access products" on public.products
  for all using (true) with check (true);

-- 5) Colunas da tabela vendas (persistência completa das vendas)
alter table public.vendas add column if not exists key_id         text;
alter table public.vendas add column if not exists key_code       text default '';
alter table public.vendas add column if not exists buyer_email    text default '';
alter table public.vendas add column if not exists product        text default '';
alter table public.vendas add column if not exists plan           text default '';
alter table public.vendas add column if not exists plan_type      text default '';
alter table public.vendas add column if not exists seller_admin_id  text default '';
alter table public.vendas add column if not exists seller_admin_name text default '';
alter table public.vendas add column if not exists expires_at     timestamptz;
alter table public.vendas add column if not exists receipt        text default '';
alter table public.vendas add column if not exists paid_at        timestamptz;
alter table public.vendas add column if not exists status         text default 'pendente';
alter table public.vendas add column if not exists notes          text default '';
alter table public.vendas add column if not exists email_sent     jsonb default '{"purchase":false,"approval":false,"reminder":false,"expiry":false}'::jsonb;

create index if not exists idx_vendas_buyer_contact on public.vendas(buyer_contact);
create index if not exists idx_vendas_paid_at on public.vendas(paid_at);

-- RLS da tabela vendas
alter table public.vendas enable row level security;
drop policy if exists "Server full access vendas" on public.vendas;
create policy "Server full access vendas" on public.vendas
  for all using (true) with check (true);

