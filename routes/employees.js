var express = require('express');
var router = express.Router();
var pgPool = require("./PostgreSQLPool");
var upload = require("./multer");

router.post('/register_employee', upload.single("employeePic"), function (req, res) {
    console.log("RECEIVED DATA:", req.body);

    try {
        const query = `
            INSERT INTO employees
            ("employeeName", "employeeDesignation", "employeeMail", "employmentID", "password", "gender", "employeePic", "role") 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        const values = [
            req.body.employeeName,
            req.body.employeeDesignation,
            req.body.employeeMail,
            req.body.employmentID,
            req.body.password,
            req.body.gender,
            req.file?.filename || null,
            req.body.role
        ];

        pgPool.query(query, values, function (error, result) {
            if (error) {
                console.error("Database Error:", error);
                return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
            } else {
                return res.status(200).json({ status: true, message: "Employee submitted successfully!" });
            }
        });

    } catch (e) {
        console.error("Server Error:", e);
        return res.status(500).json({ status: false, message: "Server Error...!" });
    }
});

router.post('/check_login_employee', function (req, res) {
    console.log("LOGIN DATA RECEIVED:", req.body);

    try {
        const { name, password, employeeId } = req.body;

        // Validate required fields
        if (!name || !password || !employeeId) {
            return res.status(400).json({ status: false, message: "Name/Email, Password, and Employee ID are required." });
        }

        const query = `
            SELECT * FROM employees
            WHERE ("employeeName" = $1 OR "employeeMail" = $1)
            AND "password" = $2
            AND "employmentID" = $3
        `;

        const values = [name, password, employeeId];

        pgPool.query(query, values, function (error, result) {
            if (error) {
                console.error("Database Error:", error);
                return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
            } else if (result.rows.length === 0) {
                return res.status(400).json({ status: false, message: "Invalid credentials or employee ID." });
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
