-- ============================================================
--  AIMZY · TABELA DE CONTAS (e-mail / senha)
--  Execute no Supabase (SQL Editor → New query → RUN)
-- ============================================================

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

create policy "Server full access accounts" on public.accounts
  for all using (true) with check (true);
