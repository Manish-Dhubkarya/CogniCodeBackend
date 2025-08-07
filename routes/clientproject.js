// routes/project.js
var express = require('express');
var router = express.Router();
var pgPool = require('./PostgreSQLPool');
var initializeDatabase = require('./init');

initializeDatabase();

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
      (workstream, title, deadline, budget, description, clientid)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING project_id
    `;

    const values = [workstream, title, deadline, parseFloat(budget), description, clientid];

    pgPool.query(query, values, function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      } else {
        const projectId = result.rows[0].project_id;
        console.log("PROOO",projectId)
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

// routes/project.js
var express = require('express');
var router = express.Router();
var pgPool = require('./PostgreSQLPool');
var initializeDatabase = require('./init');

initializeDatabase();

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
      (workstream, title, deadline, budget, description, clientid)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING project_id
    `;

    const values = [workstream, title, deadline, parseFloat(budget), description, clientid];

    pgPool.query(query, values, function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      } else {
        const projectId = result.rows[0].project_id;
        console.log("PROOO",projectId)
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
  console.log("Project IDDDDDDDDDDDD:",projectId)

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

module.exports = router;