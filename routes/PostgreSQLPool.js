require('dotenv').config();
const { Pool } = require('pg');

const pgPool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT,
  max: 10, // Connection pool limit
  ssl: { rejectUnauthorized: false }  // Required for Render external connections (TLS encryption)
});

pgPool.on('error', (err) => {
  console.error('Unexpected error on idle client:', err);
});

// Test connection on startup (optional: remove after confirming it works)
pgPool.query('SELECT NOW()')
  .then(res => console.log('✅ PG Pool Connected Successfully:', res.rows[0].now))
  .catch(err => console.error('❌ PG Pool Test Failed:', err));

module.exports = pgPool;