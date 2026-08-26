require('dotenv').config();

const supabase = require('./lib/supabase');

async function test() {
  const { error } = await supabase
    .from('users')
    .select('*')
    .limit(1);

  if (error) {
    console.error('❌ Erro no Supabase:', error.message);
    process.exit(1);
  }

  console.log('✅ Supabase conectado!');
}

test();