const pgPool = require("./PostgreSQLPool");

const initializeDatabase = async () => {
  try {
    const createSchemaAndTable = `
      CREATE TABLE IF NOT EXISTS projectSchema.clientProject (
          project_id SERIAL PRIMARY KEY,
          workstream VARCHAR(100) NOT NULL,
          title VARCHAR(255) NOT NULL,
          deadline DATE NOT NULL,
          budget DECIMAL(15, 2) NOT NULL,
          description TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await pgPool.query(createSchemaAndTable);
    console.log("Database schema and table initialized successfully.");
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  }
};

module.exports = { initializeDatabase };