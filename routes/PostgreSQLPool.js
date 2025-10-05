require('dotenv').config();
const { Pool } = require('pg');

const pgPool = new Pool({
  connectionString: process.env.PG_EXTERNAL_DB,  // Uses the updated URL with sslmode=prefer
  max: 10, // Connection pool limit
});

pgPool.on('error', (err) => {
  console.error('Unexpected error on idle client:', err);
});

// Test connection on startup (optional: remove after confirming it works)
pgPool.query('SELECT NOW()')
  .then(res => console.log('✅ PG Pool Connected Successfully:', res.rows[0].now))
  .catch(err => console.error('❌ PG Pool Test Failed:', err));

module.exports = pgPool;