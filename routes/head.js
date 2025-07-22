var express = require('express');
var router = express.Router();
var pgPool = require("./PostgreSQLPool");

router.post('/check_login_head', function (req, res) {
    console.log("LOGIN DATA RECEIVED:", req.body);

    try {
        const { name, password, securityKey } = req.body;

        // Validate required fields
        if (!name || !password || !securityKey) {
            return res.status(400).json({ status: false, message: "Name/Email, Password, and Security Key are required." });
        }

        const query = `
            SELECT * FROM head
            WHERE ("headName" = $1 OR "headMail" = $1)
            AND "password" = $2
            AND "headSecurityKey" = $3
        `;

        const values = [name, password, securityKey];

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
