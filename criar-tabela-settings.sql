-- ============================================================
--  AIMZY · TABELA DE CONFIGURAÇÕES
--  Execute no Supabase SQL Editor se a tabela settings não existir
-- ============================================================

create table if not exists public.settings (
  id text primary key default 'main',
  contact_link text default '',
  free_daily_limit integer default 3,
  admin_panel_path text default '',
  announcement jsonb default null,
  prices jsonb default '{}'::jsonb
);

-- Garantir que existe pelo menos uma linha
insert into public.settings (id) values ('main') on conflict (id) do nothing;

alter table public.settings enable row level security;

create policy "Admin full access settings" on public.settings
  for all using (true) with check (true);
