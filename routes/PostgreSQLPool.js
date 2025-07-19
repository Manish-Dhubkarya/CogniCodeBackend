require('dotenv').config();
const { Pool } = require('pg');

const pgPool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT,
  max: 10, // Connection pool limit
});

pgPool.on('error', (err) => {
  console.error('Unexpected error on idle client:', err);
});

module.exports = pgPool;