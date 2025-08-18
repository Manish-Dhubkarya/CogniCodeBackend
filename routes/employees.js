var express = require('express');
var router = express.Router();
var pgPool = require("./PostgreSQLPool");
var upload = require("./multer");
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
require('dotenv').config();

// In-memory store for pending employee registrations (email -> {data, filename, otp, timestamp})
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

router.post('/register_employee', upload.single("employeePic"), async function (req, res) {
  console.log("RECEIVED DATA:", req.body);

  try {
    const email = req.body.employeeMail;
    if (!email) {
      return res.status(400).json({ status: false, message: "Email is required." });
    }

    // Rate limit OTP resends (30 seconds)
    const pending = pendingEmployees.get(email);
    if (pending && Date.now() - pending.timestamp < 30000) {
      console.log(`Rate limit triggered for ${email}. Last attempt: ${new Date(pending.timestamp).toISOString()}`);
      return res.status(429).json({ status: false, message: "Please wait 30 seconds before resending OTP." });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store pending data with timestamp
    pendingEmployees.set(email, {
      data: req.body,
      filename: req.file?.filename || null,
      otp: otp,
      timestamp: Date.now()
    });

    // Send OTP via Gmail
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Registration OTP for CogniCode Project Management',
      text: `Your registration OTP is ${otp}. It is valid for 10 minutes.`
    });

    return res.status(200).json({ 
      status: true, 
      message: `OTP sent to ${email}.`
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: `Server Error: Failed to send OTP to ${req.body.employeeMail}. ${e.message}` });
  }
});

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
    ("employeeName", "employeeMail", "employmentID", "gender", "employeeDesignation", "password", "employeePic", "role") 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;

  const values = [
    pending.data.employeeName,
    pending.data.employeeMail,
    pending.data.employmentID,
    pending.data.gender,
    pending.data.employeeDesignation,
    hashedPassword,
    pending.filename,
    pending.data.role
  ];

  pgPool.query(query, values, function (error, result) {
    if (error) {
      console.error("Database Error:", error);
      return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
    } else {
      pendingEmployees.delete(email);
      return res.status(200).json({ status: true, message: "Employee registered successfully!" });
    }
  });
});

router.post('/check_login_employee', async function (req, res) {
  console.log("LOGIN DATA RECEIVED:", req.body);

  try {
    const { role, name, employmentId, password } = req.body;

    if (!role || !name || !employmentId || !password) {
      console.log("ERROOOOOOORR", req.body);
      return res.status(400).json({ status: false, message: "Role, Name/Email, Employment ID, and Password are required." });
    }

    const query = `
      SELECT * FROM "Entities".employees 
      WHERE role = $1
      AND ("employeeName" = $2 OR "employeeMail" = $2)
      AND "employmentID" = $3
    `;

    const values = [role, name, employmentId];

    console.log("Query Values:", values); // Debug log for query parameters

    pgPool.query(query, values, async function (error, result) {
      if (error) {
        console.error("Database Erroreeeee:", error);
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rows.length === 0) {
        console.log("No matching user found for:", values); // Debug log for no match
        return res.status(401).json({ status: false, message: "Invalid credentials." });
      } else {
        const user = result.rows[0];
        console.log("Fetched user:", user); // Debug log for fetched user
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
          return res.status(401).json({ status: false, message: "Invalid password." });
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