var express = require('express');
var router = express.Router();
var pgPool = require("./PostgreSQLPool");
var upload = require("./multer");
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables

// In-memory store for pending employee registrations (email -> {data, filename, otp, timestamp})
const pendingEmployees = new Map();

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error("Transporter Error:", error);
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

    // Send OTP via email
    await transporter.sendMail({
      from: `"Your App" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Registration OTP',
      text: `Your registration OTP is ${otp}. It is valid for 10 minutes.`
    });

    return res.status(200).json({ status: true, message: "OTP sent to your email." });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error: Failed to send OTP." });
  }
});

router.post('/verify_employee_otp', function (req, res) {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ status: false, message: "Email and OTP are required." });
  }

  const pending = pendingEmployees.get(email);
  if (!pending) {
    return res.status(400).json({ status: false, message: "No pending registration found." });
  }

  // Check expiration (10 minutes = 600000 ms)
  if (Date.now() - pending.timestamp > 600000) {
    pendingEmployees.delete(email);
    return res.status(400).json({ status: false, message: "OTP has expired." });
  }

  if (pending.otp !== otp) {
    return res.status(400).json({ status: false, message: "Invalid OTP." });
  }

  // Proceed with insertion
  const query = `
    INSERT INTO "Entities".employees
    ("employeeName", "employeeDesignation", "employeeMail", "employmentID", "password", "gender", "employeePic", "role") 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;

  const values = [
    pending.data.employeeName,
    pending.data.employeeDesignation,
    pending.data.employeeMail,
    pending.data.employmentID,
    pending.data.password,
    pending.data.gender,
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

router.post('/check_login_employee', function (req, res) {
  console.log("LOGIN DATA RECEIVED:", req.body);

  try {
    const { name, password, employeeId } = req.body;

    // Validate required fields
    if (!name || !password || !employeeId) {
      return res.status(400).json({ status: false, message: "Name/Email, Password, and Employee ID are required." });
    }

    const query = `
      SELECT * FROM "Entities".employees
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