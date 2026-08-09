const { Pool } = require('pg');

// Render/Railway/Neon-hosted Postgres typically requires SSL in production
// but not for local/CI connections — this handles both without extra config.
const useSSL = process.env.DATABASE_URL && process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

module.exports = pool;
