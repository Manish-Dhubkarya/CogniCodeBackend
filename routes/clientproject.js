var express = require('express');
var router = express.Router();
var pgPool = require('./PostgreSQLPool');
var initializeDatabase = require('./init');
var multer = require('multer');
var path = require('path');
var upload = require("./multer");
initializeDatabase();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

// Save project
router.post('/save_project', function (req, res) {
  console.log("RECEIVED PROJECT DATA:", req.body);

  try {
    const { workstream, title, deadline, budget, description, clientid } = req.body;

    if (!workstream || !title || !deadline || !budget || !description || !clientid) {
      return res.status(400).json({ status: false, message: "All fields are required." });
    }

    const query = `
      INSERT INTO projectschema.clientproject
      (workstream, title, deadline, budget, description, clientid, clientchats, clientaudios)
      VALUES ($1, $2, $3, $4, ARRAY[$5], $6, ARRAY[]::text[], ARRAY[]::text[])
      RETURNING project_id
    `;

    const values = [workstream, title, deadline, parseFloat(budget), description, clientid];

    pgPool.query(query, values, function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      } else {
        const projectId = result.rows[0].project_id;
        console.log("PROJECT ID:", projectId);
        return res.status(200).json({
          status: true,
          message: "Project details saved successfully!",
          data: { project_id: projectId }
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Get project by ID
router.get('/get_project/:projectId', function (req, res) {
  const { projectId } = req.params;
  console.log("Project ID:", projectId);

  try {
    const query = `
      SELECT * FROM projectschema.clientproject
      WHERE project_id = $1
    `;

    pgPool.query(query, [projectId], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rows.length === 0) {
        return res.status(404).json({ status: false, message: "Project not found!!" });
      } else {
        return res.status(200).json({ status: true, message: "Project details retrieved successfully!", data: result.rows[0] });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Update project
router.post('/update_project/:projectId', function (req, res) {
  console.log("REEEEEEEEEEEEEEEEEEEE",req.body)
  const { projectId } = req.params;
  const { description: newDescription } = req.body;

  if (!newDescription || newDescription.trim() === '' || newDescription === '<p><br></p>') {
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
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "Project not found!!" });
      } else {
        console.log("Updated Description Array:", result.rows[0].description);
        return res.status(200).json({
          status: true,
          message: "Project updated successfully!",
          data: { project_id: result.rows[0].project_id, description: result.rows[0].description }
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Add chat to project
router.post('/add_chat/:projectId', function (req, res) {
  const { projectId } = req.params;
  const { type, data } = req.body;

  if (!type || !data) {
    return res.status(400).json({ status: false, message: "Type and data are required." });
  }

  const chatJson = JSON.stringify({ type, data });

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
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "Project not found!!" });
      } else {
        return res.status(200).json({
          status: true,
          message: "Chat added successfully!",
          data: { project_id: result.rows[0].project_id }
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Add audio to project
router.post('/add_audio/:projectId', function (req, res) {
  const { projectId } = req.params;
  const { type, data } = req.body;

  if (!type || !data) {
    return res.status(400).json({ status: false, message: "Type and data are required." });
  }

  const audioJson = JSON.stringify({ type, data });

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
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "Project not found!!" });
      } else {
        return res.status(200).json({
          status: true,
          message: "Audio added successfully!",
          data: { project_id: result.rows[0].project_id }
        });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Upload file
router.post('/upload_file', upload.single('file'), function (req, res) {
  console.log("Audio Fileeeeee!!!", req.body)
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ status: false, message: "No file uploaded." });
    }
    const projectId = req.body.projectId;
    // You can use projectId if needed, e.g., to organize files per project
    const fileUrl = `/uploads/${file.filename}`; // Relative URL
    return res.status(200).json({ status: true, data: { fileUrl } });
  } catch (e) {
    console.error("Upload Error:", e);
    return res.status(500).json({ status: false, message: "File upload failed." });
  }
});

router.get('/get_client_projects/:clientId', function (req, res) {
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
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      } else {
        return res.status(200).json({ status: true, message: "Projects retrieved successfully!", data: result.rows });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

router.get('/show_all_clientsprojects', function (req, res) {
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
        c."clientName"
      FROM projectschema.clientproject cp
      JOIN "Entities".clients c ON cp.clientid = c."clientId"
      ORDER BY cp.deadline ASC
    `;

    pgPool.query(query, [], function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      } else {
        return res.status(200).json({ status: true, message: "All client projects retrieved successfully!", data: result.rows });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});


module.exports = router;