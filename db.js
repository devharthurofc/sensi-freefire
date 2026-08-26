require('dotenv').config();

const postgres = require('postgres');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não foi definida.');
}

const sql = postgres(process.env.DATABASE_URL);

module.exports = sql;