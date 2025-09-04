var express = require('express');
var router = express.Router();
var pgPool = require("./PostgreSQLPool");
var upload = require("./multer");
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
require('dotenv').config(); // Load environment variables

// In-memory store for pending client registrations (email -> {data, filename, otp, timestamp})
const pendingClients = new Map();

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

router.post('/save_security_key', async function (req, res) {
  const { key_id, name, email, mobile } = req.body;

  try {
    if (!key_id || !name || !email || !mobile) {
      console.log("hhhh", req.body);
      return res.status(400).json({ status: false, message: "key_id, name, email, and mobile are required." });
    }
    const query = `
      INSERT INTO "Entities"."ClientSecureKey" ("key_id", "name", "email", "mobile")
      VALUES ($1, $2, $3, $4);
    `;
    const values = [key_id, name, email, mobile];

    pgPool.query(query, values, function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({ status: false, message: "Database Error: " + error.message });
      } else {
        return res.status(200).json({ status: true, message: "Security key saved successfully!", data: result.rows[0] });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server Error: " + e.message });
  }
});

router.post('/edit_client', async function (req, res) {
  const { key_id, name, email, mobile } = req.body;

  try {
    if (!key_id || !name || !email || !mobile) {
      return res.status(400).json({ status: false, message: "key_id, name, email, and mobile are required." });
    }
    const query = `
      UPDATE "Entities"."ClientSecureKey"
      SET name = $2, email = $3, mobile = $4
      WHERE key_id = $1
      RETURNING key_id, name, email, mobile;
    `;
    const values = [key_id, name, email, mobile];

    const result = await pgPool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ status: false, message: "Client not found." });
    }
    return res.status(200).json({
      status: true,
      message: "Client updated successfully!",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Database Error:", error);
    return res.status(500).json({
      status: false,
      message: "Server Error: " + error.message
    });
  }
});

router.get('/fetch_all_clients', async function (req, res) {
  try {
    const query = `
      SELECT key_id, name, email, mobile
      FROM "Entities"."ClientSecureKey"
    `;
    const result = await pgPool.query(query);
    return res.status(200).json({
      status: true,
      data: result.rows,
      message: "Clients fetched successfully!"
    });
  } catch (error) {
    console.error("Database Error:", error);
    return res.status(500).json({
      status: false,
      message: "Server Error: " + error.message
    });
  }
});

router.post('/delete_client', async function (req, res) {
  const { key_id } = req.body;

  try {
    if (!key_id) {
      return res.status(400).json({ status: false, message: "key_id is required." });
    }
    const query = `
      DELETE FROM "Entities"."ClientSecureKey"
      WHERE key_id = $1
      RETURNING key_id;
    `;
    const values = [key_id];

    const result = await pgPool.query(query, values);
    if (result.rowCount === 0) {
      console.log("Client not found for key_id:", key_id);
      return res.status(404).json({ status: false, message: "Client not found." });
    }
    return res.status(200).json({
      status: true,
      message: "Client deleted successfully!",
      data: { key_id }
    });
  } catch (error) {
    console.error("Database Error:", error);
    return res.status(500).json({
      status: false,
      message: "Server Error: " + error.message
    });
  }
});


router.post('/register_client', upload.single("clientPic"), async function (req, res) {
  console.log("RECEIVED DATA:", req.body);

  try {
    const email = req.body.clientMail;
    const clientSecurityKey = req.body.clientSecurityKey;

    if (!email) {
      return res.status(400).json({ status: false, message: "Email is required." });
    }

    if (!clientSecurityKey || clientSecurityKey.trim() === "") {
      return res.status(400).json({ status: false, message: "Security Key is required for Client." });
    }

    // Validate security key and email for Client
    const query = `
      SELECT key_id FROM "Entities"."ClientSecureKey"
      WHERE key_id = $1 AND email = $2
    `;
    const result = await pgPool.query(query, [clientSecurityKey.trim(), email]);
    console.log(`Client Security Key and Email Query Result: ${JSON.stringify(result.rows)}`);
    if (result.rows.length === 0) {
      return res.status(400).json({ status: false, message: "Invalid Security Key or Email for Client." });
    }

    // Check if security key is already used
    const keyUsedQuery = `
      SELECT "clientSecurityKey" FROM "Entities".clients
      WHERE "clientSecurityKey" = $1
    `;
    const keyUsedResult = await pgPool.query(keyUsedQuery, [clientSecurityKey.trim()]);
    if (keyUsedResult.rows.length > 0) {
      return res.status(400).json({ status: false, message: "Security Key has already been used for registration." });
    }

    // Rate limit OTP resends (30 seconds)
    const pending = pendingClients.get(email);
    console.log("Pending Clientttt", pendingClients)
    if (pending && Date.now() - pending.timestamp < 30000) {
      console.log(`Rate limit triggered for ${email}. Last attempt: ${new Date(pending.timestamp).toISOString()}`);
      return res.status(429).json({ status: false, message: "Please wait 30 seconds before resending OTP." });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store pending data with timestamp
    pendingClients.set(email, {
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
    return res.status(500).json({ status: false, message: `Server Error: Failed to send OTP to ${req.body.clientMail}. ${e.message}` });
  }
});

router.post('/upload_client_image', upload.single("pic"), async function (req, res) {
  try {
    const clientId = req.body.clientId;
    const filename = req.file?.filename;

    if (!clientId || !filename) {
      return res.status(400).json({ status: false, message: "Client ID and image file are required." });
    }

    const query = `
      UPDATE "Entities".clients
      SET "clientPic" = $1
      WHERE "clientId" = $2
    `;
    const values = [filename, clientId];

    pgPool.query(query, values, function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(500).json({ status: false, message: "Database error while updating client image." });
      } else if (result.rowCount === 0) {
        return res.status(404).json({ status: false, message: "Client not found." });
      } else {
        return res.status(200).json({ status: true, message: "Client image updated successfully!", filename });
      }
    });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ status: false, message: "Server error while uploading client image." });
  }
});

router.post('/verify_client_otp', async function (req, res) {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(401).json({ status: false, message: "Email and OTP are required." });
  }

  const pending = pendingClients.get(email);
  console.log("CONNNNNNN", pending);
  if (!pending) {
    return res.status(400).json({ status: false, message: "No pending registration found." });
  }

  if (Date.now() - pending.timestamp > 600000) {
    pendingClients.delete(email);
    return res.status(402).json({ status: false, message: "OTP has expired." });
  }

  if (pending.otp !== otp) {
    return res.status(404).json({ status: false, message: "Invalid OTP." });
  }

  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(pending.data.password, saltRounds); // Re-enable this

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
    hashedPassword, // Use hashed password
    pending.data.department,
    pending.data.degree,
    pending.filename,
    pending.data.role,
    pending.data.clientSecurityKey
  ];

  pgPool.query(query, values, function (error, result) {
    if (error) {
      console.error("Database Error:", error);
      return res.status(400).json({ status: false, message: "Database Error, Please contact the admin. Details: " + error.message });
    } else {
      pendingClients.delete(email);
      return res.status(200).json({ status: true, message: "Client registered successfully!" });
    }
  });
});

router.post('/check_login_client', async function (req, res) {
  console.log("LOGIN DATA RECEIVED:", req.body);

  try {
    const { role, password, name, clientSecurityKey } = req.body;

    if (!role || !password || !name || !clientSecurityKey) {
      return res.status(400).json({ status: false, message: "Role, Name/Email, Password, and Client Security Key are required." });
    }

    const query = `
      SELECT * FROM "Entities".clients
      WHERE role = $1
      AND ("clientName" = $2 OR "clientMail" = $2)
      AND "clientSecurityKey" = $3
    `;

    const values = [role, name, clientSecurityKey];

    pgPool.query(query, values, async function (error, result) {
      if (error) {
        console.error("Database Error:", error);
        return res.status(400).json({ status: false, message: "Database Error, Please contact the admin." });
      } else if (result.rows.length === 0) {
        return res.status(401).json({ status: false, message: "Invalid credentials or security key." });
      } else {
        const user = result.rows[0];
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