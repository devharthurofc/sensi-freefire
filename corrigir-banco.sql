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

-- 3) Coluna type na tabela keys (Premium / Proibida)
alter table public.keys add column if not exists type text default 'premium';

-- 3.1) Coluna plans na tabela settings (planos personalizados)
alter table public.settings add column if not exists plans jsonb default '[]'::jsonb;

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
