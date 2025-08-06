// routes/project.js
const express = require("express");
const router = express.Router();
const pgPool = require("./PostgreSQLPool");

router.post("/save_project", async (req, res) => {
  console.log("RECEIVED PROJECT DATA:", req.body);

  try {
    const { projectId, workstream, title, deadline, budget, description } = req.body;

    if (!projectId || !workstream || !title || !deadline || !budget || !description) {
      return res.status(400).json({ status: false, message: "All fields are required." });
    }

    const query = `
      INSERT INTO "projectSchema"."clientProject"
      (project_id, workstream, title, deadline, budget, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (project_id) DO UPDATE 
      SET workstream = EXCLUDED.workstream,
          title = EXCLUDED.title,
          deadline = EXCLUDED.deadline,
          budget = EXCLUDED.budget,
          description = EXCLUDED.description,
          updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const values = [projectId, workstream, title, deadline, parseFloat(budget), description];

    const result = await pgPool.query(query, values);
    return res.status(200).json({
      status: true,
      message: "Project details saved successfully!",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Database Error:", error);
    return res.status(500).json({ status: false, message: "Server Error." });
  }
});

router.get("/get_project/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;

    const query = `
      SELECT * FROM projectSchema.clientProject
      WHERE project_id = $1
    `;

    const result = await pgPool.query(query, [projectId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Project not found." });
    }
    return res.status(200).json({
      status: true,
      message: "Project details retrieved successfully!",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Database Error:", error);
    return res.status(500).json({ status: false, message: "Server Error." });
  }
});

module.exports = router;