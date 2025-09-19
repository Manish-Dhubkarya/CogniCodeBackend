var express = require('express');
var router = express.Router();
var initializeDatabase1 = require("./init").initializeDatabase1;
var pgPool = require("./PostgreSQLPool");
var upload = require("./multer"); 
initializeDatabase1();
router.post('/check_login_head', function (req, res) {
    console.log("LOGIN DATA RECEIVED:", req.body);

    try {
        const { name, identifier, password, securityKey } = req.body;

        // Validate required fields
        if (!name || !password || !securityKey) {
            return res.status(400).json({ status: false, message: "Name/Email, Password, and Security Key are required." });
        }

        const query = `
            SELECT * FROM "Entities".head
            WHERE "headName" = $1
            AND ("headMail" = $2 OR "headMobile" = $2)
            AND "password" = $3
            AND "headSecurityKey" = $4
        `;

        const values = [name, identifier, password, securityKey];

        pgPool.query(query, values, function (error, result) {
            if (error) {
                console.error("Database Error:", error);
                return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
            } else if (result.rows.length === 0) {
                return res.status(401).json({ status: false, message: "Invalid credentials or security key." });
            } else {
                return res.status(200).json({ status: true, message: "Login successful!", data: result.rows[0] });
            }
        });

    } catch (e) {
        console.error("Server Error:", e);
        return res.status(500).json({ status: false, message: "Server Error...!" });
    }
});
router.post('/upload_head_image', upload.single("pic"), function (req, res) {
  try {
    const headId = req.body.headId;
    const filename = req.file?.filename;

    if (!headId || !filename) {
        console.error("Missing headId or file:", req.body, req.file);
      return res.status(400).json({ status: false, message: "Head ID and image file are required." });
    }

    const query = `
      UPDATE "Entities".head
      SET "headPic" = $1
      WHERE "headId" = $2
    `;
    const values = [filename, headId];

    pgPool.query(query, values, function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(500).json({ status: false, message: "Database error while updating head image." });
      } else if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "Head not found." });
      } else {
        return res.status(200).json({ status: true, message: "Head image updated successfully!", filename });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server error while uploading head image." });
  }
});

module.exports = router;
