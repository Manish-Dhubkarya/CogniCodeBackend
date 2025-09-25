var express = require("express");
var router = express.Router();
var pgPool = require("./PostgreSQLPool");
var initializeDatabase2 = require("./init").initializeDatabase2;
var multer = require("multer");
var path = require("path");
var upload = require("./multer");
initializeDatabase2();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "images/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// Submit a request to employeeRequests
router.post("/submit_request", async function (req, res) {
  console.log("RECEIVED REQUEST DATA:", req.body);
  try {
    const { project_id, employeeId, status } = req.body;
    if (!project_id || !employeeId || !status) {
      return res.status(400).json({ status: false, message: "All fields are required." });
    }

    const projectCheck = await pgPool.query(
      "SELECT project_id FROM projectschema.clientproject WHERE project_id = $1",
      [project_id]
    );
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Project not found." });
    }

    const employeeCheck = await pgPool.query(
      'SELECT "employeeId" FROM "Entities".employees WHERE "employeeId" = CAST($1 AS INTEGER)',
      [employeeId]
    );
    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Employee not found." });
    }

    const query = `
      INSERT INTO projectschema."employeeRequests"
      (project_id, employeeId, status)
      VALUES ($1, $2, $3)
      RETURNING request_id, project_id, employeeId, status
    `;
    const values = [project_id, employeeId, status];
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
        er.employeeid,
        er.status,
        cp.workstream,
        cp.title,
        cp.deadline::TEXT,
        cp.description,
        c."clientName",
        e."employeeName",
        e."employeeDesignation",
        e."employeePic"
      FROM projectschema."employeeRequests" er
      JOIN projectschema.clientproject cp ON er.project_id = cp.project_id
      JOIN "Entities".clients c ON cp.clientid = c."clientId"
      JOIN "Entities".employees e ON er.employeeId::integer = e."employeeId"
      ORDER BY er.created_at DESC;
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

// Check if a request exists
router.post('/check_request', async (req, res) => {
  const { project_id, employeeId } = req.body;
  console.log('Received body params:', { project_id, employeeId });
  if (!project_id || !employeeId) {
    return res.status(400).json({
      status: false,
      message: 'project_id and employeeId are required',
    });
  }

  try {
    const projectIdNum = Number(project_id);
    const employeeIdNum = Number(employeeId);
    if (isNaN(projectIdNum) || isNaN(employeeIdNum)) {
      return res.status(400).json({
        status: false,
        message: 'project_id and employeeId must be valid numbers',
      });
    }

    const query = `
      SELECT EXISTS (
        SELECT 1 FROM projectschema."employeeRequests"
        WHERE project_id = $1 AND employeeid = $2
      ) AS exists;
    `;
    const values = [projectIdNum, employeeIdNum];
    const result = await pgPool.query(query, values);
    res.status(200).json({
      status: true,
      data: {
        exists: result.rows[0].exists,
      },
    });
  } catch (err) {
    console.error('Error checking request:', err);
    res.status(500).json({
      status: false,
      message: 'Internal server error',
    });
  }
});

router.get("/project_request_status/:employeeId", async function (req, res) {
  const { employeeId } = req.params;
  try {
    const query = `
      SELECT 
        er.request_id,
        er.project_id::TEXT,
        er.employeeid,
        er.status,
        er.created_at::TEXT,
        cp.workstream,
        cp.title,
        cp.deadline::TEXT,
        cp.description,
        c."clientName"
      FROM projectschema."employeeRequests" er
      JOIN projectschema.clientproject cp ON er.project_id = cp.project_id
      JOIN "Entities".clients c ON cp.clientid = c."clientId"
      WHERE er.employeeid = $1
      ORDER BY er.created_at DESC;
    `;
    const result = await pgPool.query(query, [employeeId]);
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

// Update request status
router.get("/employee_statuses", function (req, res) {
  console.log("RECEIVED EMPLOYEE STATUSES REQUEST:", req.query);
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ status: false, message: "project_id is required." });
    }

    const projectIdNum = Number(project_id);
    if (isNaN(projectIdNum)) {
      return res.status(400).json({ status: false, message: "project_id must be a valid number." });
    }

    const fetchStatusesQuery = `
      SELECT employeeid AS id, status
      FROM projectschema."employeeRequests"
      WHERE project_id = $1;
    `;
    pgPool.query(fetchStatusesQuery, [projectIdNum], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      }

      return res.status(200).json({
        status: true,
        data: result.rows,
      });
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

router.get("/project_employee_requests/:projectId", function (req, res) {
  console.log("RECEIVED PROJECT EMPLOYEE REQUESTS:", req.params);
  try {
    const { projectId } = req.params;
    const projectIdNum = Number(projectId);
    if (isNaN(projectIdNum)) {
      return res.status(400).json({ status: false, message: "project_id must be a valid number." });
    }

    const fetchRequestsQuery = `
      SELECT 
        er.request_id,
        er.employeeid AS id,
        er.status,
        e."employeeName" AS name,
        e."employeePic" AS pic
      FROM projectschema."employeeRequests" er
      JOIN "Entities".employees e ON er.employeeid = e."employeeId"::text
      WHERE er.project_id = $1
      ORDER BY er.created_at DESC;
    `;
    pgPool.query(fetchRequestsQuery, [projectIdNum], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      }

      return res.status(200).json({
        status: true,
        data: result.rows,
      });
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

router.post("/update_request_status", function (req, res) {
  console.log("RECEIVED UPDATE REQUEST DATA:", req.body);
  try {
    const { request_id, project_id, employeeId } = req.body;
    if (!request_id || !project_id || !employeeId) {
      console.log("Request", req.body);
      return res.status(400).json({ status: false, message: "request_id, project_id, and employeeId are required." });
    }

    const requestIdNum = Number(request_id);
    const projectIdNum = Number(project_id);
    const employeeIdStr = String(employeeId);

    if (isNaN(requestIdNum) || isNaN(projectIdNum)) {
      return res.status(400).json({ status: false, message: "request_id and project_id must be valid numbers." });
    }

    const updateAssignQuery = `
      UPDATE projectschema."employeeRequests"
      SET status = 'accepted'
      WHERE request_id = $1 AND employeeid = $2
      RETURNING status;
    `;
    pgPool.query(updateAssignQuery, [requestIdNum, employeeIdStr], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      }
      if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "No matching request found to assign." });
      }

      return res.status(200).json({
        status: true,
        message: "Request assigned successfully!",
        updatedStatus: result.rows[0].status,
      });
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

router.post("/decline_request_status", function (req, res) {
  console.log("RECEIVED DECLINE REQUEST DATA:", req.body);
  try {
    const { request_id, project_id, employeeId } = req.body;
    if (!request_id || !project_id || !employeeId) {
      console.log("Request", req.body);
      return res.status(400).json({ status: false, message: "request_id, project_id, and employeeId are required." });
    }

    const requestIdNum = Number(request_id);
    const projectIdNum = Number(project_id);
    const employeeIdStr = String(employeeId);

    if (isNaN(requestIdNum) || isNaN(projectIdNum)) {
      return res.status(400).json({ status: false, message: "request_id and project_id must be valid numbers." });
    }

    const updateDeclineQuery = `
      UPDATE projectschema."employeeRequests"
      SET status = 'decline'
      WHERE request_id = $1 AND employeeid = $2
      RETURNING status;
    `;
    pgPool.query(updateDeclineQuery, [requestIdNum, employeeIdStr], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      }
      if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "No matching request found to decline." });
      }

      return res.status(200).json({
        status: true,
        message: "Request declined successfully!",
        updatedStatus: result.rows[0].status,
      });
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
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
      (workstream, title, deadline, budget, description, clientid, clientchats, clientaudios, headchats, headaudios, tlchats, tlaudios)
      VALUES ($1, $2, $3, $4, ARRAY[$5], $6, ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[])
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
router.post("/add_chat/:projectId", async function (req, res) {
  const { projectId } = req.params;
  const { type, data, timestamp, mention } = req.body;

  if (!type || !data || !timestamp) {
    return res.status(400).json({ status: false, message: "Type, data, and timestamp are required." });
  }

  const projectIdNum = Number(projectId);
  if (isNaN(projectIdNum)) {
    return res.status(400).json({ status: false, message: "projectId must be a valid number." });
  }

  try {
    const projectCheck = await pgPool.query(
      "SELECT project_id FROM projectschema.clientproject WHERE project_id = $1",
      [projectIdNum]
    );
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Project not found." });
    }

    if (mention) {
      if (mention.type === 'head') {
        const headCheck = await pgPool.query(
          'SELECT "headId" FROM "Entities".head WHERE "headId" = $1',
          [mention.id]
        );
        if (headCheck.rows.length === 0) {
          return res.status(400).json({ status: false, message: "Invalid head mention." });
        }
      } else {
        return res.status(400).json({ status: false, message: "Invalid mention type (client can only mention head)." });
      }
    }

    const chatJson = JSON.stringify({ 
      type, 
      data, 
      timestamp, 
      seen: false, 
      mention: mention || null 
    });

    const query = `
      UPDATE projectschema.clientproject
      SET clientchats = array_append(clientchats, $1)
      WHERE project_id = $2
      RETURNING project_id, clientchats
    `;
    const result = await pgPool.query(query, [chatJson, projectIdNum]);

    if (result.rowCount === 0) {
      return res.status(404).json({ status: false, message: "Project not found." });
    }

    return res.status(200).json({
      status: true,
      message: "Client chat added successfully!",
      data: { project_id: result.rows[0].project_id },
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: `Server Error: ${e.message}` });
  }
});

// Add client audio to project
router.post("/add_audio/:projectId", function (req, res) {
  const { projectId } = req.params;
  const { type, data, timestamp } = req.body;
  if (!type || !data || !timestamp) {
    return res.status(400).json({ status: false, message: "Type, data, and timestamp are required." });
  }
  const audioJson = JSON.stringify({ type, data, timestamp, seen: false });
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
  const { type, data, timestamp, headid, mention } = req.body;

  if (!type || !data || !timestamp) {
    return res
      .status(400)
      .json({ status: false, message: "Type, data, and timestamp are required." });
  }

  if (!headid) {
    return res.status(400).json({ status: false, message: "Head ID is required." });
  }

  const chatJson = JSON.stringify({ 
  type, 
  data, 
  timestamp, 
  seen_by: [],  // Changed from seen: false
  mention 
});

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
  const audioJson = JSON.stringify({ type, data, timestamp, seen: false });
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

  if (!clientId || isNaN(clientId)) {
    return res.status(400).json({
      status: false,
      message: "Invalid or missing clientId",
    });
  }

  try {
    const query = `
      SELECT 
        cp.*, 
        c."clientName",
        c."clientPic",
        h."headName" as headname,
        h."headPic",
        e."employeeName" AS "teamleadername",
        e."employeePic" AS "teamleaderpic"
      FROM projectschema.clientproject cp
      LEFT JOIN "Entities".clients c ON cp.clientid = c."clientId"
      LEFT JOIN "Entities".head h ON cp.headid = h."headId"
      LEFT JOIN "Entities".employees e ON cp.teamleaderid = e."employeeId" AND e."role" = 'Team Leader'
      WHERE cp.clientid = $1
      ORDER BY deadline DESC
    `;
    pgPool.query(query, [clientId], async function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({
          status: false,
          message: "Database Error, Please contact the admin.",
        });
      }

      try {
        const projects = result.rows.map((p) => {
          let unread_count = 0;
          let has_unread_mention = false;

          const receivedMessages = [
            ...(p.headchats || []),
            ...(p.headaudios || []),
          ].filter(msg_str => msg_str && msg_str.trim() !== ""); // Filter empty or invalid entries

          receivedMessages.forEach((msg_str) => {
            try {
              const msg = JSON.parse(msg_str);
              if (msg.seen === false) {
                unread_count++;
                if (msg.mention && msg.mention.type === "client" && msg.mention.id.toString() === clientId.toString()) {
                  has_unread_mention = true;
                }
              }
            } catch (e) {
              console.error(`Error parsing message for project ${p.project_id}:`, e);
            }
          });

          return {
            ...p,
            unread_count,
            has_unread_mention,
            headname: p.headname || "Head",
          };
        });

        return res.status(200).json({
          status: true,
          message: "Projects retrieved successfully!",
          data: projects,
        });
      } catch (e) {
        console.error("Error processing project data:", e);
        return res.status(500).json({
          status: false,
          message: "Error processing project data",
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({
      status: false,
      message: "Server Error...!",
    });
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
        cp.tlchats,
        cp.tlaudios,
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
  const { index, fromClient, type, fromHead, fromTeamLeader, viewer } = req.body;

  if (
    typeof index !== "number" ||
    index < 0 ||
    typeof fromClient !== "boolean" ||
    typeof fromHead !== "boolean" ||
    typeof fromTeamLeader !== "boolean" ||
    !["chat", "audio"].includes(type) ||
    !["client", "head", "tl"].includes(viewer)
  ) {
    return res.status(400).json({ status: false, message: "Invalid request parameters" });
  }

  try {
    let field;
    if (fromClient) {
      field = type === "audio" ? "clientaudios" : "clientchats";
    } else if (fromHead) {
      field = type === "audio" ? "headaudios" : "headchats";
    } else if (fromTeamLeader) {
      field = type === "audio" ? "tlaudios" : "tlchats";
    } else {
      return res.status(400).json({ status: false, message: "Invalid sender type" });
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

    if (!Array.isArray(msgObj.seen_by)) {
      msgObj.seen_by = [];  // Fallback if old format
    }

    if (msgObj.seen_by.includes(viewer)) {
      return res.status(200).json({ status: true, message: "Message already seen by this user" });
    }

    msgObj.seen_by.push(viewer);
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

// Add team leader chat to project
router.post("/add_tl_chat/:projectId", async function (req, res) {
  const { projectId } = req.params;
  const { type, data, timestamp, teamleaderid, mention } = req.body;

  if (!type || !data || !timestamp || !teamleaderid) {
    return res.status(400).json({
      status: false,
      message: "Type, data, timestamp, and teamleaderid are required.",
    });
  }

  const projectIdNum = Number(projectId);
  if (isNaN(projectIdNum)) {
    return res.status(400).json({ status: false, message: "projectId must be a valid number." });
  }

  try {
    const projectCheck = await pgPool.query(
      "SELECT project_id FROM projectschema.clientproject WHERE project_id = $1",
      [projectIdNum]
    );
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Project not found." });
    }

    const teamLeaderCheck = await pgPool.query(
      'SELECT "employeeId" FROM "Entities".employees WHERE "employeeId" = $1 AND role = $2',
      [teamleaderid, 'Team Leader']
    );
    if (teamLeaderCheck.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Team Leader not found or invalid role." });
    }

    if (mention) {
      if (mention.type === 'client') {
        const clientCheck = await pgPool.query(
          'SELECT "clientId" FROM "Entities".clients WHERE "clientId" = $1',
          [mention.id]
        );
        if (clientCheck.rows.length === 0) {
          return res.status(400).json({ status: false, message: "Invalid client mention." });
        }
      } else if (mention.type === 'head') {
        const headCheck = await pgPool.query(
          'SELECT "headId" FROM "Entities".head WHERE "headId" = $1',
          [mention.id]
        );
        if (headCheck.rows.length === 0) {
          return res.status(400).json({ status: false, message: "Invalid head mention." });
        }
      }
    }

    const chatJson = JSON.stringify({ 
      type, 
      data, 
      timestamp, 
      seen: false, 
      mention: mention || null 
    });

    const query = `
      UPDATE projectschema.clientproject
      SET tlchats = array_append(tlchats, $1),
          teamleaderid = $3
      WHERE project_id = $2
      RETURNING project_id, tlchats, teamleaderid
    `;
    const result = await pgPool.query(query, [chatJson, projectIdNum, teamleaderid]);

    if (result.rowCount === 0) {
      return res.status(404).json({ status: false, message: "Project not found." });
    }

    return res.status(200).json({
      status: true,
      message: "Team Leader chat added successfully!",
      data: {
        project_id: result.rows[0].project_id,
        teamleaderid: result.rows[0].teamleaderid,
      },
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: `Server Error: ${e.message}` });
  }
});

// Update the get_project endpoint to include clientid and headid
router.get("/get_project/:projectId", function (req, res) {
  const { projectId } = req.params;
  console.log("Project ID:", projectId);
  try {
    const query = `
      SELECT 
        cp.*, 
        c."clientId" as clientid,
        c."clientName",
        c."clientPic",
        h."headId" as headid,
        h."headPic",
        h."headName",
        e."employeeName" AS "teamLeaderName",
        e."employeePic" AS "teamLeaderPic"
      FROM projectschema.clientproject cp
      LEFT JOIN "Entities".clients c ON cp.clientid = c."clientId"
      LEFT JOIN "Entities".head h ON cp.headid = h."headId"
      LEFT JOIN "Entities".employees e ON cp.teamleaderid = e."employeeId" AND e."role" = 'Team Leader'
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

// Add team leader audio to project
router.post("/add_tl_audio/:projectId", async function (req, res) {
  const { projectId } = req.params;
  const { type, data, timestamp, teamleaderid } = req.body;

  if (!type || !data || !timestamp || !teamleaderid) {
    return res.status(400).json({
      status: false,
      message: "Type, data, timestamp, and teamleaderid are required.",
    });
  }

  const projectIdNum = Number(projectId);
  if (isNaN(projectIdNum)) {
    return res.status(400).json({ status: false, message: "projectId must be a valid number." });
  }

  try {
    const projectCheck = await pgPool.query(
      "SELECT project_id FROM projectschema.clientproject WHERE project_id = $1",
      [projectIdNum]
    );
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Project not found." });
    }

    const teamLeaderCheck = await pgPool.query(
      'SELECT "employeeId" FROM "Entities".employees WHERE "employeeId" = $1 AND role = $2',
      [teamleaderid, 'Team Leader']
    );
    if (teamLeaderCheck.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Team Leader not found or invalid role." });
    }

    const audioJson = JSON.stringify({ type, data, timestamp, seen: false });

    const query = `
      UPDATE projectschema.clientproject
      SET tlaudios = array_append(tlaudios, $1),
          teamleaderid = $3
      WHERE project_id = $2
      RETURNING project_id, tlaudios, teamleaderid
    `;
    const result = await pgPool.query(query, [audioJson, projectIdNum, teamleaderid]);

    if (result.rowCount === 0) {
      return res.status(404).json({ status: false, message: "Project not found." });
    }

    return res.status(200).json({
      status: true,
      message: "Team Leader audio added successfully!",
      data: {
        project_id: result.rows[0].project_id,
        teamleaderid: result.rows[0].teamleaderid,
      },
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: `Server Error: ${e.message}` });
  }
});

module.exports = router;
console.log("Client Project route loaded...");