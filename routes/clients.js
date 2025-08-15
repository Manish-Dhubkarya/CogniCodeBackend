var express = require('express');
var router = express.Router();
var pgPool = require("./PostgreSQLPool");
var upload = require("./multer");
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables

// In-memory store for pending client registrations (email -> {data, filename, otp, timestamp})
const pendingClients = new Map();

// Initialize transporter
let transporter;
if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
  console.error("Error: GMAIL_USER or GMAIL_PASS not set in .env file. Falling back to Ethereal for testing.");
  nodemailer.createTestAccount().then(testAccount => {
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    console.log("Ethereal transporter created for testing. Check console for email preview URLs.");
    transporter.verify((error, success) => {
      if (error) {
        console.error("Ethereal Transporter Error:", error);
      } else {
        console.log("Ethereal transporter is ready to send emails");
      }
    });
  }).catch(err => {
    console.error("Failed to create Ethereal test account:", err);
  });
} else {
  console.log("GMAIL_USER:", process.env.GMAIL_USER);
  console.log("GMAIL_PASS:", process.env.GMAIL_PASS ? "Set" : "Not set");
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS
    }
  });
  // Verify Gmail transporter
  transporter.verify((error, success) => {
    if (error) {
      console.error("Gmail Transporter Error:", error);
    } else {
      console.log("Gmail transporter is ready to send emails");
    }
  });
}

router.post('/register_client', upload.single("clientPic"), async function (req, res) {
  console.log("RECEIVED DATA:", req.body);

  try {
    const email = req.body.clientMail;
    if (!email) {
      return res.status(400).json({ status: false, message: "Email is required." });
    }

    // Rate limit OTP resends (30 seconds) - Comment out for testing
    /*
    const pending = pendingClients.get(email);
    if (pending && Date.now() - pending.timestamp < 30000) {
      console.log(`Rate limit triggered for ${email}. Last attempt: ${new Date(pending.timestamp).toISOString()}`);
      return res.status(429).json({ status: false, message: "Please wait 30 seconds before resending OTP." });
    }
    */

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store pending data with timestamp
    pendingClients.set(email, {
      data: req.body,
      filename: req.file?.filename || null,
      otp: otp,
      timestamp: Date.now()
    });

    // Send OTP via email
    const info = await transporter.sendMail({
      from: `"Your App" <${process.env.GMAIL_USER || 'test@ethereal.email'}>`,
      to: email,
      subject: 'Registration OTP',
      text: `Your registration OTP is ${otp}. It is valid for 10 minutes.`
    });

    // Log Ethereal preview URL if using Ethereal
    if (transporter.options.host === "smtp.ethereal.email") {
      console.log("Ethereal Email Preview URL:", nodemailer.getTestMessageUrl(info));
    }

    return res.status(200).json({ 
      status: true, 
      message: transporter.options.host === "smtp.ethereal.email" 
        ? "OTP sent to email (check console for Ethereal preview URL during testing)." 
        : `OTP sent to ${email}.`
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: `Server Error: Failed to send OTP to ${req.body.clientMail}. ${e.message}` });
  }
});

router.post('/verify_client_otp', function (req, res) {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ status: false, message: "Email and OTP are required." });
  }

  const pending = pendingClients.get(email);
  if (!pending) {
    return res.status(400).json({ status: false, message: "No pending registration found." });
  }

  // Check expiration (10 minutes = 600000 ms)
  if (Date.now() - pending.timestamp > 600000) {
    pendingClients.delete(email);
    return res.status(400).json({ status: false, message: "OTP has expired." });
  }

  if (pending.otp !== otp) {
    return res.status(400).json({ status: false, message: "Invalid OTP." });
  }

  // Proceed with insertion
  const query = `
    INSERT INTO "Entities".clients
    ("clientName", "clientMail", "mobile", "requirement", "password", "department", "degree", "clientPic", "role", "clientSecurityKey") 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `;

  const values = [
    pending.data.clientName,
    pending.data.clientMail,
    pending.data.mobile,
    pending.data.requirement,
    pending.data.password,
    pending.data.department,
    pending.data.degree,
    pending.filename,
    pending.data.role,
    pending.data.clientSecurityKey
  ];

  pgPool.query(query, values, function (error, result) {
    if (error) {
      console.error("Database Error:", error);
      return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
    } else {
      pendingClients.delete(email);
      return res.status(200).json({ status: true, message: "Client registered successfully!" });
    }
  });
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
      SELECT * FROM "Entities".clients
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