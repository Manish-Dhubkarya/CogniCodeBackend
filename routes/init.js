const pgPool = require("./PostgreSQLPool");

const initializeDatabase = async () => {
  try {
    await pgPool.query(`
      CREATE SCHEMA IF NOT EXISTS projectSchema;

      CREATE TABLE IF NOT EXISTS projectSchema.clientProject (
          project_id SERIAL PRIMARY KEY,
          workstream VARCHAR(100) NOT NULL,
          title VARCHAR(255) NOT NULL,
          deadline DATE NOT NULL,
          budget DECIMAL(15, 2) NOT NULL,
          description TEXT NOT NULL,
          clientid INTEGER NOT NULL
      );
    `);

    console.log("✅ Database schema and table initialized successfully.");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
  }
};

module.exports = initializeDatabase;
