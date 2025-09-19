const pgPool = require("./PostgreSQLPool");

const initializeDatabase1 = async () => {
  try {
    await pgPool.query(`
      CREATE SCHEMA IF NOT EXISTS "Entities";
      
CREATE TABLE IF NOT EXISTS "Entities".head (
    "headId" INTEGER NOT NULL PRIMARY KEY,
    "headName" CHARACTER VARYING(100) NOT NULL,
    "headMail" CHARACTER VARYING(100) NOT NULL,
    "headMobile" CHARACTER VARYING(15) NOT NULL,
    "headSecurityKey" CHARACTER VARYING(10) NOT NULL,
    "headPic" TEXT,
    "role" CHARACTER VARYING(20) NOT NULL DEFAULT 'Head'::bpchar,
    "password" TEXT NOT NULL DEFAULT 'himashu'
);        
    `);

    await pgPool.query(`
  CREATE TABLE IF NOT EXISTS "Entities"."TeamLeaderSecureKey" (
    "key_id" VARCHAR(100) NOT NULL PRIMARY KEY,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "mobile" VARCHAR(15) NOT NULL
  );
`);
 await pgPool.query(`
CREATE TABLE IF NOT EXISTS "Entities"."ClientSecureKey" (
    "key_id" CHARACTER VARYING(100) NOT NULL PRIMARY KEY,
    "name" CHARACTER VARYING(100) NOT NULL,
    "email" CHARACTER VARYING(150) NOT NULL,
    "mobile" CHARACTER VARYING(15)
);
`)
 await pgPool.query(`
CREATE TABLE IF NOT EXISTS "Entities"."clients" (
    "clientId" INTEGER NOT NULL PRIMARY KEY,
    "clientName" CHARACTER VARYING(100) NOT NULL,
    "clientMail" TEXT NOT NULL,
    "mobile" CHARACTER VARYING(15) NOT NULL,
    "requirement" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "department" CHARACTER VARYING(100) NOT NULL,
    "degree" CHARACTER VARYING(100) NOT NULL,
    "clientPic" TEXT,
    "role" CHARACTER VARYING(20) NOT NULL,
    "clientSecurityKey" TEXT NOT NULL DEFAULT 'default_key'::text'
);
 `)
 await pgPool.query(`
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
);
`)

 await pgPool.query(`

CREATE TABLE IF NOT EXISTS "Entities".employees (
    "employeeId" integer NOT NULL PRIMARY KEY,
    "employeeName" character varying(200) NOT NULL,
    "employeeDesignation" character varying(100) NOT NULL,
    "employeeMail" text NOT NULL,
    "employmentID" character varying(100) NOT NULL,
    "password" text NOT NULL,
    "gender" character varying(50) NOT NULL,
    "employeePic" text,
    "role" character varying(20) DEFAULT 'Employee' NOT NULL,
    "securityKey" character varying(20),
);
`)


    console.log("✅ Database schema and table initialized successfully.");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
  }
};
const initializeDatabase2 = async () => {
  try {
    await pgPool.query(`
      CREATE SCHEMA IF NOT EXISTS projectSchema;

    CREATE TABLE IF NOT EXISTS "projectschema"."clientproject" (
    "project_id" integer PRIMARY KEY DEFAULT nextval('projectschema.clientproject_project_id_seq'::regclass) NOT NULL,
    "workstream" character varying(100) NOT NULL,
    "title" character varying(255) NOT NULL,
    "deadline" date NOT NULL,
    "budget" numeric(15, 2) NOT NULL,
    "description" text NOT NULL,
    "clientid" integer DEFAULT 3 NOT NULL,
    "clientchats" text,
    "clientaudios" text,
    "headchats" text,
    "headaudios" text,
    "headid" integer,
    "teamleaderid" integer,
    "tlchats" text,
    "tlaudios" text
);
    `);
    await pgPool.query(`

    CREATE TABLE IF NOT EXISTS "projectschema"."employeeRequests" (
    "request_id" integer PRIMARY KEY DEFAULT nextval('projectschema."employeeRequests_request_id_seq"'::regclass) NOT NULL,
    "project_id" integer,
    "employeeid" character varying(255),
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
`)

    console.log("✅ Database schema and table initialized successfully.");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
  }
};

module.exports = {initializeDatabase1, initializeDatabase2};
