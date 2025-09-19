var express = require('express');
var router = express.Router();
var pgPool = require("./PostgreSQLPool");
var upload = require("./multer");
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
require('dotenv').config();

// In-memory store for pending registrations
const pendingEmployees = new Map();

// Initialize Gmail transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

// Verify transporter
transporter.verify((error, success) => {
  if (error) {
    console.error("Gmail Transporter Error:", error);
  } else {
    console.log("Gmail transporter is ready to send emails");
  }
});

// Register Employee or Team Leader
router.post('/register_employee', upload.single("employeePic"), async function (req, res) {
  // console.log("RECEIVED DATA:", req.body);

  try {
    const { employeeMail, role, securityKey, employeeName, employmentID, gender, employeeDesignation, password } = req.body;

    // Validate required fields
    if (!employeeMail) {
      return res.status(400).json({ status: false, message: "Email is required." });
    }

    // Check if email already exists in employees or employeeRegRequest
    const emailCheckQuery = `
      SELECT "employeeMail" FROM "Entities".employees
      WHERE "employeeMail" = $1
      UNION
      SELECT "employeeMail" FROM "Entities"."employeeRegRequest"
      WHERE "employeeMail" = $1
    `;
    const emailCheckResult = await pgPool.query(emailCheckQuery, [employeeMail]);
    if (emailCheckResult.rows.length > 0) {
      return res.status(400).json({ status: false, message: "Email is already registered or pending approval." });
    }

    // Validate security key and email for Team Leader
    if (role === "Team Leader") {
      if (!securityKey || securityKey.trim() === "") {
        return res.status(400).json({ status: false, message: "Security Key is required for Team Leader." });
      }
      const trimmedKey = securityKey.trim();
      const query = `
        SELECT key_id FROM "Entities"."TeamLeaderSecureKey"
        WHERE key_id = $1 AND email = $2
      `;
      const result = await pgPool.query(query, [trimmedKey, employeeMail]);
      console.log(`Team Leader Security Key and Email Query: key_id=${trimmedKey}, email=${employeeMail}, Result: ${JSON.stringify(result.rows)}`);
      if (result.rows.length === 0) {
        return res.status(400).json({ status: false, message: "Invalid Security Key or Email for Team Leader." });
      }

      // Check if securityKey is already used
      const keyUsedQuery = `
        SELECT "securityKey" FROM "Entities".employees
        WHERE "securityKey" = $1
        UNION
        SELECT "securityKey" FROM "Entities"."employeeRegRequest"
        WHERE "securityKey" = $1
      `;
      const keyUsedResult = await pgPool.query(keyUsedQuery, [trimmedKey]);
      if (keyUsedResult.rows.length > 0) {
        return res.status(400).json({ status: false, message: "Security Key has already been used for registration." });
      }
    }

    // Rate limit OTP resends (30 seconds)
    const pending = pendingEmployees.get(employeeMail);
    if (pending && Date.now() - pending.timestamp < 30000) {
      console.log(`Rate limit triggered for ${employeeMail}. Last attempt: ${new Date(pending.timestamp).toISOString()}`);
      return res.status(429).json({ status: false, message: "Please wait 30 seconds before resending OTP." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store pending data with timestamp
    pendingEmployees.set(employeeMail, {
      data: {
        employeeName,
        employeeMail,
        employmentID,
        gender,
        employeeDesignation,
        password: hashedPassword,
        role,
        securityKey: role === "Team Leader" ? securityKey : null
      },
      filename: req.file?.filename || null,
      otp: otp,
      timestamp: Date.now()
    });

    // Send OTP via Gmail
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: employeeMail,
      subject: 'Registration OTP for CogniCode Project Management',
      text: `Your registration OTP is ${otp}. It is valid for 10 minutes.`
    });

    return res.status(200).json({
      status: true,
      message: `OTP sent to ${employeeMail}.`
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: `Server Error: Failed to send OTP to ${req.body.employeeMail}. ${e.message}` });
  }
});

// Verify Employee OTP
router.post('/verify_employee_otp', async function (req, res) {
  const { email, otp } = req.body;

  if (!email || !otp) {
    console.log("Missing email or OTP:", req.body);
    return res.status(400).json({ status: false, message: "Email and OTP are required." });
  }

  const pending = pendingEmployees.get(email);
  if (!pending) {
    return res.status(400).json({ status: false, message: "No pending registration found." });
  }

  if (Date.now() - pending.timestamp > 600000) {
    pendingEmployees.delete(email);
    return res.status(400).json({ status: false, message: "OTP has expired." });
  }

  if (pending.otp !== otp) {
    return res.status(400).json({ status: false, message: "Invalid OTP." });
  }

  const { data, filename } = pending;

  // Insert into employeeRegRequest with status 'pending'
  const insertQuery = `
    INSERT INTO "Entities"."employeeRegRequest" (
      "employeeName", "employeeMail", "employmentID", "gender", "employeeDesignation",
      "password", "role", "securityKey", "employeePic", "status"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
    RETURNING id
  `;
  const values = [
    data.employeeName,
    data.employeeMail,
    data.employmentID,
    data.gender,
    data.employeeDesignation,
    data.password,
    data.role,
    data.securityKey,
    filename
  ];

  try {
    const insertResult = await pgPool.query(insertQuery, values);
    pendingEmployees.delete(email);
    return res.status(200).json({
      status: true,
      message: "Registration request submitted successfully. Awaiting admin approval."
    });
  } catch (error) {
    console.error("Database Error:", error);
    return res.status(500).json({ status: false, message: "Database Error, Please contact the admin." });
  }
});

// Fetch All Employee Registration Requests
router.get('/fetch_all_registrations', async function (req, res) {
  try {
    const query = `
      SELECT id, "employeeName", "employeeMail", "employmentID", "employeeDesignation",
             gender, role, "securityKey", "employeePic", status
      FROM "Entities"."employeeRegRequest"
      ORDER BY CASE
        WHEN status = 'pending' THEN 1
        WHEN status = 'accepted' THEN 2
        WHEN status = 'rejected' THEN 3
        ELSE 4
      END
    `;
    const result = await pgPool.query(query);

    return res.status(200).json({
      status: true,
      data: result.rows.map(row => ({
        id: row.id.toString(),
        employeeName: row.employeeName,
        employeeMail: row.employeeMail,
        employmentID: row.employmentID,
        employeeDesignation: row.employeeDesignation,
        gender: row.gender,
        role: row.role,
        securityKey: row.securityKey,
        employeePic: row.employeePic,
        status: row.status
      }))
    });
  } catch (error) {
    console.error("Error fetching all registrations:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error while fetching all registrations."
    });
  }
});

// Admin: Accept Employee Registration Request
router.post('/admin/accept_employee_request/:requestId', async function (req, res) {
  const { requestId } = req.params;

  try {
    // Fetch the pending request
    const fetchQuery = `
      SELECT * FROM "Entities"."employeeRegRequest"
      WHERE id = $1 AND status = 'pending'
    `;
    const fetchResult = await pgPool.query(fetchQuery, [requestId]);

    if (fetchResult.rows.length === 0) {
      return res.status(400).json({ status: false, message: "No pending request found." });
    }

    const requestData = fetchResult.rows[0];

    // Insert into employees table
    const insertEmployeeQuery = `
      INSERT INTO "Entities".employees (
        "employeeName", "employeeMail", "employmentID", "gender", "employeeDesignation",
        "password", "role", "securityKey", "employeePic"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;
    await pgPool.query(insertEmployeeQuery, [
      requestData.employeeName,
      requestData.employeeMail,
      requestData.employmentID,
      requestData.gender,
      requestData.employeeDesignation,
      requestData.password,
      requestData.role,
      requestData.securityKey,
      requestData.employeePic
    ]);

    // Update request status to 'accepted'
    const updateQuery = `
      UPDATE "Entities"."employeeRegRequest"
      SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    await pgPool.query(updateQuery, [requestId]);

    // Send approval email
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: requestData.employeeMail,
      subject: 'Registration Approved - CogniCode Project Management',
      text: 'Your registration has been approved. You can now log in.'
    });

    return res.status(200).json({ status: true, message: "Employee registration approved." });
  } catch (error) {
    console.error("Accept Request Error:", error);
    return res.status(500).json({ status: false, message: "Server error during approval." });
  }
});

// Admin: Reject Employee Registration Request
router.post('/admin/reject_employee_request/:requestId', async function (req, res) {
  const { requestId } = req.params;

  try {
    // Fetch the pending request
    const fetchQuery = `
      SELECT * FROM "Entities"."employeeRegRequest"
      WHERE id = $1
    `;
    const fetchResult = await pgPool.query(fetchQuery, [requestId]);

    if (fetchResult.rows.length === 0) {
      return res.status(400).json({ status: false, message: "No pending request found." });
    }

    const requestData = fetchResult.rows[0];

    // Update request status to 'rejected'
    const updateQuery = `
      UPDATE "Entities"."employeeRegRequest"
      SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    await pgPool.query(updateQuery, [requestId]);

    // Send rejection email
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: requestData.employeeMail,
      subject: 'Registration Rejected - CogniCode Project Management',
      text: 'Your registration request was not approved. Please contact the admin for more details.'
    });

    return res.status(200).json({ status: true, message: "Employee registration request rejected." });
  } catch (error) {
    console.error("Reject Request Error:", error);
    return res.status(500).json({ status: false, message: "Server error during rejection." });
  }
});

// Check Login Employee
router.post('/check_login_employee', async function (req, res) {
  console.log("LOGIN DATA RECEIVED:", req.body);

  try {
    const { role, name, employmentId, password, securityKey } = req.body;

    if (!role || !name || !employmentId || !password) {
      console.log("Missing required fields:", req.body);
      return res.status(400).json({ status: false, message: "Role, Name/Email, Employment ID, and Password areHo required." });
    }

    if (role === "Team Leader" && (!securityKey || securityKey.trim() === "")) {
      return res.status(400).json({ status: false, message: "Security Key is required for Team Leader login." });
    }

    const query = `
      SELECT * FROM "Entities".employees
      WHERE role = $1
      AND ("employeeName" = $2 OR "employeeMail" = $2)
      AND "employmentID" = $3
    `;
    const values = [role, name, employmentId];

    console.log("Query Values:", values);

    pgPool.query(query, values, async function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rows.length === 0) {
        console.log("No matching user found for:", values);
        return res.status(401).json({ status: false, message: "Invalid credentials." });
      } else {
        const user = result.rows[0];
        console.log("Fetched user:", user);
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
          return res.status(401).json({ status: false, message: "Invalid password." });
        }
        if (role === "Team Leader" && user.securityKey !== securityKey) {
          return res.status(401).json({ status: false, message: "Invalid Security Key." });
        }
        return res.status(200).json({ status: true, message: "Login successful!", data: user });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error...!" });
  }
});

// Upload Employee Image
router.post('/upload_employee_image', upload.single("pic"), async function (req, res) {
  try {
    const employeeId = req.body.employeeId;
    const filename = req.file?.filename;

    if (!employeeId || !filename) {
      return res.status(400).json({ status: false, message: "Employee ID and image file are required." });
    }

    const query = `
      UPDATE "Entities".employees
      SET "employeePic" = $1
      WHERE "employeeId" = $2
    `;
    const values = [filename, employeeId];

    pgPool.query(query, values, function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(500).json({ status: false, message: "Database error while updating employee image." });
      } else if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "Employee not found." });
      } else {
        return res.status(200).json({ status: true, message: "Employee image updated successfully!", filename });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server error while uploading employee image." });
  }
});

// Fetch All Employees
router.get('/fetch_all_employees', async function (req, res) {
  try {
    const projectId = req.query.project_id;
    let query = `
      SELECT "employeeId", "employeeName", "employeeDesignation", "employeeMail", "employmentID", "employeePic", "role"
      FROM "Entities".employees
      WHERE "role" = $1
    `;
    const values = ['Employee'];

    if (projectId) {
      query += `
        AND "employeeId" NOT IN (
          SELECT CAST("employeeid" AS INTEGER)
          FROM projectschema."employeeRequests"
          WHERE project_id = $2
        )
      `;
      values.push(projectId);
    }

    const result = await pgPool.query(query, values);

    res.json({
      status: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;