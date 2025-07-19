var express = require('express');
var router = express.Router();
var pgPool = require("./PostgreSQLPool");
var upload = require("./multer");

router.post('/submit_employee', upload.single("employeePic"), function (req, res) {
    console.log("RECEIVED DATA:", req.body);

    try {
        const query = `
            INSERT INTO employees
            ("employeeName", "employeeDesignation", "employeeMail", "employmentID", "password", "gender", "employeePic") 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;

        const values = [
            req.body.employeeName,
            req.body.employeeDesignation,
            req.body.employeeMail,
            req.body.employmentID,
            req.body.password,
            req.body.gender,
            req.file?.filename || null
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

module.exports = router;
