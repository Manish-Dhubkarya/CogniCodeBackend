var express = require('express');
var router = express.Router();
var pgPool = require("./PostgreSQLPool");
var upload = require("./multer");

router.post('/register_client', upload.single("clientPic"), function (req, res) {
    console.log("RECEIVED DATA:", req.body);

    try {
        const query = `
            INSERT INTO clients
            ("clientName", "clientMail", "mobile", "requirement", "password", "department", "degree", "clientPic", "role", "clientSecurityKey") 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;

        const values = [
            req.body.clientName,
            req.body.clientMail,
            req.body.mobile,
            req.body.requirement,
            req.body.password,
            req.body.department,
            req.body.degree,
            req.file?.filename || null,
            req.body.role,
            req.body.clientSecurityKey
        ];

        pgPool.query(query, values, function (error, result) {
            if (error) {
                console.error("Database Error:", error);
                return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
            } else {
                return res.status(200).json({ status: true, message: "Client submitted successfully!" });
            }
        });

    } catch (e) {
        console.error("Server Error:", e);
        return res.status(500).json({ status: false, message: "Server Error...!" });
    }
});

router.post('/check_login_client', function (req, res) {
    console.log("LOGIN DATA RECEIVED:", req.body);

    try {
        const { name, password, clientSecurityKey } = req.body;

        // Validate required fields
        if (!name || !password || !clientSecurityKey) {
            return res.status(400).json({ status: false, message: "Name/Email, Password, and Client Security Key are required." });
        }

        const query = `
            SELECT * FROM clients
            WHERE ("clientName" = $1 OR "clientMail" = $1)
            AND "password" = $2
            AND "clientSecurityKey" = $3
        `;

        const values = [name, password, clientSecurityKey];

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

module.exports = router;
