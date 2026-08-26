'use strict';

console.log('Iniciando teste...');

const sql = require('./db');

async function test() {
  try {
    console.log('Tentando conectar...');

    const result = await sql`SELECT NOW() AS agora`;

    console.log('✅ SUPABASE CONECTADO!');
    console.log(result);

    await sql.end();
  } catch (error) {
    console.error('❌ ERRO AO CONECTAR:', error);
  }
}

test();