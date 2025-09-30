const pgPool = require("./PostgreSQLPool");

const initializeDatabase1 = async () => {
  try {
    await pgPool.query(`
      CREATE SCHEMA IF NOT EXISTS "Entities";

      CREATE TABLE IF NOT EXISTS "Entities".head (
        "headId" INTEGER NOT NULL PRIMARY KEY,
        "headName" VARCHAR(100) NOT NULL,
        "headMail" VARCHAR(100) NOT NULL,
        "headMobile" VARCHAR(15) NOT NULL,
        "headSecurityKey" VARCHAR(10) NOT NULL,
        "headPic" TEXT,
        "role" VARCHAR(20) NOT NULL DEFAULT 'Head',
        "password" TEXT NOT NULL DEFAULT 'himashu'
      );

      CREATE TABLE IF NOT EXISTS "Entities"."TeamLeaderSecureKey" (
        "key_id" VARCHAR(100) PRIMARY KEY,
        "name" VARCHAR(100) NOT NULL,
        "email" VARCHAR(150) NOT NULL,
        "mobile" VARCHAR(15) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "Entities"."ClientSecureKey" (
        "key_id" VARCHAR(100) PRIMARY KEY,
        "name" VARCHAR(100) NOT NULL,
        "email" VARCHAR(150) NOT NULL,
        "mobile" VARCHAR(15)
      );

      CREATE TABLE IF NOT EXISTS "Entities"."clients" (
        "clientId" INTEGER PRIMARY KEY,
        "clientName" VARCHAR(100) NOT NULL,
        "clientMail" TEXT NOT NULL,
        "mobile" VARCHAR(15) NOT NULL,
        "requirement" TEXT NOT NULL,
        "password" TEXT NOT NULL,
        "department" VARCHAR(100) NOT NULL,
        "degree" VARCHAR(100) NOT NULL,
        "clientPic" TEXT,
        "role" VARCHAR(20) NOT NULL,
        "clientSecurityKey" TEXT NOT NULL DEFAULT 'default_key'::text
      );

      CREATE TABLE IF NOT EXISTS "Entities"."employeeRegRequest" (
        id SERIAL PRIMARY KEY,
        "employeeName" VARCHAR(255) NOT NULL,
        "employeeMail" VARCHAR(255) UNIQUE NOT NULL,
        "employmentID" VARCHAR(100) NOT NULL,
        gender VARCHAR(20) NOT NULL,
        "employeeDesignation" VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('Employee', 'Team Leader')),
        "securityKey" VARCHAR(255),
        "employeePic" VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_employeeRegRequest_email ON "Entities"."employeeRegRequest" ("employeeMail");
      CREATE INDEX IF NOT EXISTS idx_employeeRegRequest_status ON "Entities"."employeeRegRequest" (status);

      CREATE TABLE IF NOT EXISTS "Entities".employees (
        "employeeId" INTEGER PRIMARY KEY,
        "employeeName" VARCHAR(200) NOT NULL,
        "employeeDesignation" VARCHAR(100) NOT NULL,
        "employeeMail" TEXT NOT NULL,
        "employmentID" VARCHAR(100) NOT NULL,
        "password" TEXT NOT NULL,
        "gender" VARCHAR(50) NOT NULL,
        "employeePic" TEXT,
        "role" VARCHAR(20) DEFAULT 'Employee' NOT NULL,
        "securityKey" VARCHAR(20)
      );
    `);

    console.log("✅ Database 1 (Entities) initialized successfully.");
  } catch (error) {
    console.error("❌ Error initializing Database 1:", error);
  }
};


const initializeDatabase2 = async () => {
  try {
    await pgPool.query(`
      CREATE SCHEMA IF NOT EXISTS projectschema;

      CREATE TABLE IF NOT EXISTS projectschema."clientproject" (
        "project_id" SERIAL PRIMARY KEY,
        "workstream" VARCHAR(100) NOT NULL,
        "title" VARCHAR(255) NOT NULL,
        "deadline" DATE NOT NULL,
        "budget" NUMERIC(15, 2) NOT NULL,
        "description" TEXT NOT NULL,
        "clientid" INTEGER DEFAULT 3 NOT NULL,
        "clientchats" TEXT,
        "clientaudios" TEXT,
        "headchats" TEXT,
        "headaudios" TEXT,
        "headid" INTEGER,
        "teamleaderid" INTEGER,
        "tlchats" TEXT,
        "tlaudios" TEXT
      );

      CREATE TABLE IF NOT EXISTS projectschema."employeeRequests" (
        "request_id" SERIAL PRIMARY KEY,
        "project_id" INTEGER,
        "employeeid" VARCHAR(255),
        "status" VARCHAR(50) DEFAULT 'pending',
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS projectschema."projectMonitors" (
        "monitorId" SERIAL PRIMARY KEY,
        "employeeId" INTEGER NOT NULL,
        "projectId" INTEGER NOT NULL,
        "status" VARCHAR(255) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projectschema."projectTLClientChats" (
    "projectId" INTEGER REFERENCES projectschema.clientproject(project_id) ON DELETE CASCADE,
    "TeamLeaderId" INTEGER REFERENCES "Entities".employees("employeeId"),
    "MonitorId" INTEGER REFERENCES "Entities".employees("employeeId"),
    "TLChats" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "TLAudios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "MonitorChats" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "MonitorAudios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    PRIMARY KEY ("projectId")
);
    `);

    console.log("✅ Database 2 (ProjectSchema) initialized successfully.");
  } catch (error) {
    console.error("❌ Error initializing Database 2:", error);
  }
};

module.exports = { initializeDatabase1, initializeDatabase2 };
