require('dotenv').config({ quiet: true });
const postgres = require('postgres');

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  await sql`create table if not exists app_state (
    id text primary key,
    data jsonb not null default '{}'::jsonb,
    saved_at timestamptz not null default now()
  )`;

  await sql`insert into app_state (id) values ('db') on conflict (id) do nothing`;

  const rows = await sql`select id, saved_at from app_state`;

  console.log('Tabela app_state criada/verificada no Supabase OK');
  console.log(rows);

  await sql.end();
}

main().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
