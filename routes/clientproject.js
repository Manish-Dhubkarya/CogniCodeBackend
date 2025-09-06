var express = require("express");
var router = express.Router();
var pgPool = require("./PostgreSQLPool");
var initializeDatabase = require("./init");
var multer = require("multer");
var path = require("path");
var upload = require("./multer");
initializeDatabase();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "images/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// Initialize database with updated schema
router.get("/init", function (req, res) {
  const query = `
    CREATE SCHEMA IF NOT EXISTS projectschema;
    CREATE TABLE IF NOT EXISTS projectschema."employeeRequests" (
      request_id SERIAL PRIMARY KEY,
      project_id INTEGER,
      employeeId INTEGER,
      workstream VARCHAR(255),
      title VARCHAR(255),
      clientName VARCHAR(255),
      deadline DATE,
      description TEXT,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  pgPool.query(query, function (error, result) {
    if (error) {
      console.error("Database Initialization Error:", error);
      return res
        .status(500)
        .json({ status: false, message: `Database Initialization Failed: ${error.message}` });
    }
    return res
      .status(200)
      .json({ status: true, message: "Database Initialized Successfully!" });
  });
});

// Submit a request to employeeRequests
router.post("/submit_request", async function (req, res) {
  console.log("RECEIVED REQUEST DATA:", req.body);
  try {
    const { project_id, employeeId, workstream, title, clientName, deadline, description, status } = req.body;
    if (!project_id || !employeeId || !workstream || !title || !clientName || !deadline || !description) {
      return res.status(400).json({ status: false, message: "All fields are required." });
    }

    // Validate project_id exists (application-level check)
    const projectCheck = await pgPool.query(
      "SELECT project_id FROM projectschema.clientproject WHERE project_id = $1",
      [project_id]
    );
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Project not found." });
    }

    // Validate employeeId exists and is an integer
    const employeeCheck = await pgPool.query(
      'SELECT "employeeId" FROM "Entities".employees WHERE "employeeId" = CAST($1 AS INTEGER)',
      [employeeId]
    );
    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Employee not found." });
    }

    const query = `
      INSERT INTO projectschema."employeeRequests"
      (project_id, employeeId, workstream, title, clientName, deadline, description, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING request_id, project_id, employeeId, workstream, title, clientName, deadline, description, status
    `;
    const values = [
      project_id,
      employeeId,
      workstream,
      title,
      clientName,
      deadline,
      description,
      status || "pending",
    ];
    const result = await pgPool.query(query, values);
    return res.status(200).json({
      status: true,
      message: "Request submitted successfully!",
      data: result.rows[0],
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: `Server Error: ${e.message}` });
  }
});

// Get all employeeRequests for Team Leader
router.get("/employee_requests", async function (req, res) {
  try {
    const query = `
      SELECT 
        er.request_id,
        er.project_id::TEXT,
        er.employeeId,
        er.workstream,
        er.title,
        er.clientName,
        er.deadline::TEXT,
        er.description,
        er.status,
        er.created_at
      FROM projectschema."employeeRequests" er
      ORDER BY er.created_at DESC
    `;
    const result = await pgPool.query(query);
    return res.status(200).json({
      status: true,
      message: "Employee requests retrieved successfully!",
      data: result.rows,
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: `Server Error: ${e.message}` });
  }
});

// Save project
router.post("/save_project", function (req, res) {
  console.log("RECEIVED PROJECT DATA:", req.body);
  try {
    const { workstream, title, deadline, budget, description, clientid } = req.body;
    if (!workstream || !title || !deadline || !budget || !description || !clientid) {
      return res.status(400).json({ status: false, message: "All fields are required." });
    }
    const query = `
      INSERT INTO projectschema.clientproject
      (workstream, title, deadline, budget, description, clientid, clientchats, clientaudios, headchats, headaudios)
      VALUES ($1, $2, $3, $4, ARRAY[$5], $6, ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[])
      RETURNING project_id
    `;
    const values = [workstream, title, deadline, parseFloat(budget), description, clientid];
    pgPool.query(query, values, function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res
          .status(400)
          .json({ status: false, message: "Database Error, Please contact the admin." });
      } else {
        const projectId = result.rows[0].project_id;
        console.log("PROJECT ID:", projectId);
        return res.status(200).json({
          status: true,
          message: "Project details saved successfully!",
          data: { project_id: projectId },
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Get project by ID
router.get("/get_project/:projectId", function (req, res) {
  const { projectId } = req.params;
  console.log("Project ID:", projectId);
  try {
    const query = `
      SELECT 
        cp.*, 
        h."headPic"
      FROM projectschema.clientproject cp
      LEFT JOIN "Entities".head h 
        ON cp.headid = h."headId"
      WHERE cp.project_id = $1
    `;
    pgPool.query(query, [projectId], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res
          .status(400)
          .json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rows.length === 0) {
        return res.status(404).json({ status: false, message: "Project not found!!" });
      } else {
        return res.status(200).json({
          status: true,
          message: "Project details retrieved successfully!",
          data: result.rows[0],
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Update project
router.post("/update_project/:projectId", function (req, res) {
  console.log("UPDATE PROJECT:", req.body);
  const { projectId } = req.params;
  const { description: newDescription } = req.body;
  if (!newDescription || newDescription.trim() === "" || newDescription === "<p><br></p>") {
    console.error("Invalid description:", newDescription);
    return res.status(400).json({ status: false, message: "Valid description is required." });
  }
  try {
    const query = `
      UPDATE projectschema.clientproject
      SET description = array_append(description, $1)
      WHERE project_id = $2
      RETURNING project_id, description
    `;
    pgPool.query(query, [newDescription, projectId], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res
          .status(400)
          .json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "Project not found!!" });
      } else {
        console.log("Updated Description Array:", result.rows[0].description);
        return res.status(200).json({
          status: true,
          message: "Project updated successfully!",
          data: { project_id: result.rows[0].project_id, description: result.rows[0].description },
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Add client chat to project
router.post("/add_chat/:projectId", function (req, res) {
  const { projectId } = req.params;
  const { type, data, timestamp } = req.body;
  if (!type || !data || !timestamp) {
    return res.status(400).json({ status: false, message: "Type, data, and timestamp are required." });
  }
  const chatJson = JSON.stringify({ type, data, timestamp });
  try {
    const query = `
      UPDATE projectschema.clientproject
      SET clientchats = array_append(clientchats, $1)
      WHERE project_id = $2
      RETURNING project_id, clientchats
    `;
    pgPool.query(query, [chatJson, projectId], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res
          .status(400)
          .json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "Project not found!!" });
      } else {
        return res.status(200).json({
          status: true,
          message: "Chat added successfully!",
          data: { project_id: result.rows[0].project_id },
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Add client audio to project
router.post("/add_audio/:projectId", function (req, res) {
  const { projectId } = req.params;
  const { type, data, timestamp } = req.body;
  if (!type || !data || !timestamp) {
    return res.status(400).json({ status: false, message: "Type, data, and timestamp are required." });
  }
  const audioJson = JSON.stringify({ type, data, timestamp });
  try {
    const query = `
      UPDATE projectschema.clientproject
      SET clientaudios = array_append(clientaudios, $1)
      WHERE project_id = $2
      RETURNING project_id, clientaudios
    `;
    pgPool.query(query, [audioJson, projectId], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res
          .status(400)
          .json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "Project not found!!" });
      } else {
        return res.status(200).json({
          status: true,
          message: "Audio added successfully!",
          data: { project_id: result.rows[0].project_id },
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Add head chat to project
router.post("/add_head_chat/:projectId", function (req, res) {
  const { projectId } = req.params;
  const { type, data, timestamp, headid } = req.body; // Assume headid is sent in the request body

  // Validate required fields
  if (!type || !data || !timestamp) {
    return res
      .status(400)
      .json({ status: false, message: "Type, data, and timestamp are required." });
  }

  // Optional: Validate headid if required
  if (!headid) {
    return res.status(400).json({ status: false, message: "Head ID is required." });
  }

  const chatJson = JSON.stringify({ type, data, timestamp });

  try {
    const query = `
      UPDATE projectschema.clientproject
      SET headchats = array_append(headchats, $1),
      headid = $3
      WHERE project_id = $2
      RETURNING project_id, headchats, headid
    `;
    pgPool.query(query, [chatJson, projectId, headid], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res
          .status(400)
          .json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "Project not found!!" });
      } else {
        return res.status(200).json({
          status: true,
          message: "Head chat added and head ID updated successfully!",
          data: {
            project_id: result.rows[0].project_id,
            headid: result.rows[0].headid,
          },
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Add head audio to project
router.post("/add_head_audio/:projectId", function (req, res) {
  const { projectId } = req.params;
  const { type, data, timestamp } = req.body;
  if (!type || !data || !timestamp) {
    return res
      .status(400)
      .json({ status: false, message: "Type, data, and timestamp are required." });
  }
  const audioJson = JSON.stringify({ type, data, timestamp });
  try {
    const query = `
      UPDATE projectschema.clientproject
      SET headaudios = array_append(headaudios, $1)
      WHERE project_id = $2
      RETURNING project_id, headaudios
    `;
    pgPool.query(query, [audioJson, projectId], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res
          .status(400)
          .json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "Project not found!!" });
      } else {
        return res.status(200).json({
          status: true,
          message: "Head audio added successfully!",
          data: { project_id: result.rows[0].project_id },
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Upload file
router.post("/upload_file", upload.single("file"), function (req, res) {
  console.log("File Upload:", req.body);
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ status: false, message: "No file uploaded." });
    }
    const projectId = req.body.projectId;
    const fileUrl = `/images/${file.filename}`;
    return res.status(200).json({ status: true, data: { fileUrl } });
  } catch (e) {
    console.error("Upload Error:", e);
    return res.status(500).json({ status: false, message: "File upload failed." });
  }
});

// Get client projects
router.get("/get_client_projects/:clientId", function (req, res) {
  const { clientId } = req.params;
  console.log("Client ID:", clientId);
  try {
    const query = `
      SELECT * FROM projectschema.clientproject
      WHERE clientid = $1
      ORDER BY deadline DESC
    `;
    pgPool.query(query, [clientId], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res
          .status(400)
          .json({ status: false, message: "Database Error, Please contact the admin." });
      } else {
        return res.status(200).json({
          status: true,
          message: "Projects retrieved successfully!",
          data: result.rows,
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Show all client projects
router.get("/show_all_clientsprojects", function (req, res) {
  try {
    const query = `
      SELECT 
        cp.project_id,
        cp.workstream,
        cp.title,
        cp.deadline,
        cp.budget,
        cp.description,
        cp.clientchats,
        cp.clientaudios,
        cp.headchats,
        cp.headaudios,
        c."clientName",
        c."clientPic"
      FROM projectschema.clientproject cp
      JOIN "Entities".clients c ON cp.clientid = c."clientId"
      ORDER BY cp.deadline ASC
    `;
    pgPool.query(query, [], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res
          .status(400)
          .json({ status: false, message: "Database Error, Please contact the admin." });
      } else {
        return res.status(200).json({
          status: true,
          message: "All client projects retrieved successfully!",
          data: result.rows,
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Mark message as seen
router.post("/mark_message_seen/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const { index, fromClient, type } = req.body; // Expect index (msg.id), fromClient (boolean), type ('chat' or 'audio')

  if (
    typeof index !== "number" ||
    index < 0 ||
    typeof fromClient !== "boolean" ||
    !["chat", "audio"].includes(type)
  ) {
    return res.status(400).json({ status: false, message: "Invalid request parameters" });
  }

  try {
    let field;
    if (fromClient) {
      field = type === "audio" ? "clientaudios" : "clientchats";
    } else {
      field = type === "audio" ? "headaudios" : "headchats";
    }

    const result = await pgPool.query(
      `SELECT ${field} FROM projectschema.clientproject WHERE project_id = $1`,
      [projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Project not found" });
    }

    const messages = result.rows[0][field] || [];

    if (index >= messages.length) {
      return res.status(400).json({ status: false, message: "Invalid message index" });
    }

    let msgObj;
    try {
      msgObj = JSON.parse(messages[index]);
    } catch (parseError) {
      console.error("Error parsing message JSON:", parseError);
      return res.status(500).json({ status: false, message: "Invalid message format" });
    }

    if (msgObj.seen === true) {
      return res.status(200).json({ status: true, message: "Message already seen" });
    }

    msgObj.seen = true;
    messages[index] = JSON.stringify(msgObj);

    await pgPool.query(
      `UPDATE projectschema.clientproject SET ${field} = $1 WHERE project_id = $2`,
      [messages, projectId]
    );

    return res.status(200).json({ status: true, message: "Message marked as seen" });
  } catch (error) {
    console.error("Error marking message as seen:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
});

module.exports = router;