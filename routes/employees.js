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
  console.log("RECEIVED DATA:", req.body);

  try {
    const { employeeMail, role, securityKey, employeeName, employmentID, gender, employeeDesignation, password } = req.body;

    // Validate required fields
    if (!employeeMail) {
      return res.status(400).json({ status: false, message: "Email is required." });
    }

    // Check if email already exists
    const emailCheckQuery = `
      SELECT "employeeMail" FROM "Entities".employees
      WHERE "employeeMail" = $1
    `;
    const emailCheckResult = await pgPool.query(emailCheckQuery, [employeeMail]);
    if (emailCheckResult.rows.length > 0) {
      return res.status(400).json({ status: false, message: "Email is already registered." });
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

    // Store pending data with timestamp
    pendingEmployees.set(employeeMail, {
      data: { employeeName, employeeMail, employmentID, gender, employeeDesignation, password, role, securityKey: role === "Team Leader" ? securityKey : null },
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

  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(pending.data.password, saltRounds);

  const query = `
    INSERT INTO "Entities".employees
    ("employeeName", "employeeMail", "employmentID", "gender", "employeeDesignation", "password", "employeePic", "role", "securityKey") 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `;

  const values = [
    pending.data.employeeName,
    pending.data.employeeMail,
    pending.data.employmentID,
    pending.data.gender,
    pending.data.employeeDesignation,
    hashedPassword,
    pending.filename,
    pending.data.role,
    pending.data.securityKey || null
  ];

  try {
    await pgPool.query(query, values);
    pendingEmployees.delete(email);
    return res.status(200).json({ status: true, message: "Employee registered successfully!" });
  } catch (error) {
    console.error("Database Error:", error);
    return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
  }
});

// Check Login Employee
router.post('/check_login_employee', async function (req, res) {
  console.log("LOGIN DATA RECEIVED:", req.body);

  try {
    const { role, name, employmentId, password, securityKey } = req.body;

    if (!role || !name || !employmentId || !password) {
      console.log("ERROOOOOOORR", req.body);
      return res.status(400).json({ status: false, message: "Role, Name/Email, Employment ID, and Password are required." });
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
        console.error("Database Erroreeeee:", error);
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

module.exports = router;