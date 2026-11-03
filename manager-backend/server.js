
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("node:crypto");

const app = express();
const PORT = process.env.PORT || 3001;

const path = require("node:path");

app.use(
  express.static(
    path.join(__dirname, "../manager-dashboard")
  )
);

// Read private configuration from .env
const MANAGER_API_KEY = process.env.MANAGER_API_KEY;
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD;
const N8N_DECISION_URL = process.env.N8N_DECISION_URL;

// Stop the server if required configuration is missing.
if (!MANAGER_API_KEY || !MANAGER_PASSWORD || !N8N_DECISION_URL) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

// Middleware
app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000"
    ]
  })
);

// Authenticate the manager before allowing decisions.
function authenticateManager(req, res, next) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Basic ")) {
    return res.status(401).json({
      success: false,
      message: "Manager authentication required."
    });
  }

  let credentials;

  try {
    credentials = Buffer.from(
      authorization.slice(6),
      "base64"
    ).toString("utf8");
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication."
    });
  }

  const separator = credentials.indexOf(":");

  if (separator === -1) {
    return res.status(401).json({
      success: false,
      message: "Invalid manager credentials."
    });
  }

  const username = credentials.slice(0, separator);
  const password = credentials.slice(separator + 1);

  const suppliedHash = crypto
    .createHash("sha256")
    .update(password)
    .digest();

  const expectedHash = crypto
    .createHash("sha256")
    .update(MANAGER_PASSWORD)
    .digest();

  const validPassword =
    username === "manager" &&
    crypto.timingSafeEqual(suppliedHash, expectedHash);

  if (!validPassword) {
    return res.status(401).json({
      success: false,
      message: "Invalid manager credentials."
    });
  }

  next();
}


// Retrieve refund history for authenticated managers.
app.get("/api/refund-history", authenticateManager, async (req, res) => {
  try {
    const response = await fetch(process.env.N8N_HISTORY_URL, {
      headers: {
        "X-Manager-API-Key": MANAGER_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`n8n returned HTTP ${response.status}`);
    }

    const refunds = await response.json();

    if (!Array.isArray(refunds)) {
      throw new Error("Invalid refund history received from n8n.");
    }

    return res.status(200).json(refunds);

  } catch (error) {
    console.error("Refund history error:", error.message);

    return res.status(502).json({
      success: false,
      message: "Unable to retrieve refund history."
    });
  }
});


// Retrieve pending refunds for authenticated managers.
app.get("/api/refund-requests", authenticateManager, async (req, res) => {
  try {
    const response = await fetch(process.env.N8N_REFUNDS_URL, {
    headers: {
        "X-Manager-API-Key": MANAGER_API_KEY
    }
    });

    if (!response.ok) {
      throw new Error(`n8n returned HTTP ${response.status}`);
    }

    const refunds = await response.json();

    if (!Array.isArray(refunds)) {
      throw new Error("Invalid refund data received from n8n.");
    }

    return res.status(200).json(refunds);

  } catch (error) {
    console.error("Refund retrieval error:", error.message);

    return res.status(502).json({
      success: false,
      message: "Unable to retrieve refund requests."
    });
  }
});


// Verify manager credentials during login.
app.post("/api/login", authenticateManager, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Manager authenticated successfully."
  });
});

// Receive a manager's decision and forward it to n8n.
app.post(
  "/api/refund-decision",
  authenticateManager,
  async (req, res) => {
    try {
      const {
        request_id,
        decision,
        manager_notes
      } = req.body || {};

      // Validate the submitted decision.
      if (
        !Number.isSafeInteger(request_id) ||
        request_id <= 0 ||
        !["approved", "rejected"].includes(decision) ||
        typeof manager_notes !== "string" ||
        manager_notes.trim().length < 5
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid manager decision."
        });
      }

      // Forward the decision to n8n using the private API key.
      const response = await fetch(N8N_DECISION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Manager-API-Key": MANAGER_API_KEY
        },
        body: JSON.stringify({
          request_id,
          decision,
          manager_notes: manager_notes.trim()
        })
      });

      const result = await response.json();

      // Preserve n8n's HTTP status and response.
      return res.status(response.status).json(result);

    } catch (error) {
      console.error("Manager decision error:", error.message);

      return res.status(502).json({
        success: false,
        message: "Unable to process manager decision."
      });
    }
  }
);

// Start the local backend server.
app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Manager backend running at http://localhost:${PORT}`
  );
});
