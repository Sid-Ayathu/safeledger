const express = require("express");
const axios = require("axios");
const amqp = require("amqplib");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://localhost:3001";
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const QUEUE_NAME = "transaction_events";
const DB_PATH = path.join(__dirname, "ledger_db.json");

// --- DATABASE HELPERS ---
function getDb() {
  if (!fs.existsSync(DB_PATH)) {
    const initialData = {
      accounts: [
        { userId: 1, balance: 10000 },
        { userId: 2, balance: 50000 },
      ],
      transactions: {},
      currentTransactionId: 1000,
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

let channel;

// --- ARTIFICIAL LOAD GENERATOR ---
function simulateHeavyTask() {
  let result = 0;
  for (let i = 0; i < 5000000; i++) {
    result += Math.sqrt(i) * Math.random();
  }
  return result;
}

// RabbitMQ Connection
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    console.log("✅ Connected to RabbitMQ");
  } catch (error) {
    console.error("RabbitMQ Connection Error:", error);
  }
}
connectRabbitMQ();

// Auth Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const response = await axios.post(`${AUTH_SERVICE_URL}/verify`, { token });
    if (response.data.valid) {
      req.user = response.data.user;
      next();
    } else {
      return res.status(403).json({ message: "Invalid Token" });
    }
  } catch (error) {
    return res.status(500).json({ message: "Authentication failed" });
  }
};

// --- ROUTES ---

app.get("/health", (req, res) => {
  res.json({ service: "Ledger Service", status: "Active" });
});

app.get("/balance", authenticateToken, (req, res) => {
  simulateHeavyTask();

  const db = getDb();
  // Use loose comparison (==) to handle string/number IDs
  let account = db.accounts.find((acc) => acc.userId == req.user.id);

  if (!account) {
    // Lazy Initialization
    account = { userId: req.user.id, balance: 1000 };
    db.accounts.push(account);
    console.log(`🆕 Created account for User ${req.user.id} with $1000 bonus`);
    saveDb(db);
  }

  res.json({ userId: req.user.id, balance: account.balance });
});

app.get("/status/:transactionId", authenticateToken, (req, res) => {
  const { transactionId } = req.params;
  const db = getDb();
  const transaction = db.transactions[transactionId];
  if (!transaction)
    return res.status(404).json({ message: "Transaction not found" });
  res.json(transaction);
});

// Transfer Money
app.post("/transfer", authenticateToken, async (req, res) => {
  simulateHeavyTask();

  const db = getDb();
  const { amount, recipientId } = req.body;
  const senderId = req.user.id;

  // 1. Check Sender
  let senderAcc = db.accounts.find((acc) => acc.userId == senderId);
  if (!senderAcc) {
    return res
      .status(404)
      .json({
        message: "Sender account not found. Please check balance first.",
      });
  }

  // 2. Check Recipient
  let recipientAcc = db.accounts.find((acc) => acc.userId == recipientId);
  if (!recipientAcc) {
    return res
      .status(404)
      .json({ message: `Recipient account ${recipientId} does not exist.` });
  }

  // 3. Check Balance
  if (senderAcc.balance < amount) {
    return res.status(400).json({ message: "Insufficient funds" });
  }

  // 4. Execute Deduction
  senderAcc.balance -= amount;

  const transactionId = (db.currentTransactionId++).toString();
  const transactionEvent = {
    transactionId,
    senderId,
    recipientId,
    amount,
    timestamp: new Date().toISOString(),
    status: "PENDING",
  };

  db.transactions[transactionId] = transactionEvent;
  saveDb(db);

  if (channel) {
    channel.sendToQueue(
      QUEUE_NAME,
      Buffer.from(JSON.stringify(transactionEvent))
    );
    console.log(`📨 Event sent to queue: ${transactionId}`);
  }

  res.json({
    message: "Transaction processing",
    status: "PENDING",
    transactionId,
  });
});

app.post("/transaction/update", async (req, res) => {
  const { transactionId, status } = req.body;
  const db = getDb();

  if (db.transactions[transactionId]) {
    db.transactions[transactionId].status = status;
    console.log(`🔄 Transaction ${transactionId} updated to ${status}`);

    // Retrieve transaction details
    const tx = db.transactions[transactionId];

    // REFUND LOGIC (If Fraud Detected)
    if (status === "REJECTED") {
      const senderAcc = db.accounts.find((acc) => acc.userId == tx.senderId);
      if (senderAcc) {
        senderAcc.balance += tx.amount;
        console.log(`↩️  Refunded ${tx.amount} to User ${tx.senderId}`);
      }
    }

    // CREDIT LOGIC (If Verified)
    if (status === "COMPLETED") {
      // FIX: Use loose equality (==) to find recipient even if types mismatch
      const recipientAcc = db.accounts.find(
        (acc) => acc.userId == tx.recipientId
      );

      if (recipientAcc) {
        recipientAcc.balance += tx.amount;
        console.log(
          `💰 Credited ${tx.amount} to Recipient ${tx.recipientId}. New Balance: ${recipientAcc.balance}`
        );
      } else {
        console.error(
          `⚠️ CRITICAL: Recipient ${tx.recipientId} NOT FOUND during credit. Money lost?`
        );
      }
    }

    saveDb(db);
    return res.json({ success: true });
  }

  res.status(404).json({ error: "Transaction not found" });
});

app.listen(PORT, () => {
  console.log(`💰 Ledger Service running on port ${PORT}`);
});
