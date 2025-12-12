const express = require('express');
const axios = require('axios');
const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUE_NAME = 'transaction_events';
const DB_PATH = path.join(__dirname, 'ledger_db.json');

// --- DATABASE HELPERS ---
function getDb() {
    if (!fs.existsSync(DB_PATH)) {
        // Initialize default DB if it doesn't exist
        const initialData = {
            accounts: [
                { userId: 1, balance: 1000 }, 
                { userId: 2, balance: 50000 } 
            ],
            transactions: {},
            currentTransactionId: 1000
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDb(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

let channel;

// --- ARTIFICIAL LOAD GENERATOR ---
// Triggers CPU spike for HPA Demo
function simulateHeavyTask() {
    let result = 0;
    // Loop 5 million times
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
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

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

app.get('/health', (req, res) => {
    res.json({ service: 'Ledger Service', status: 'Active' });
});

// Check Balance (CPU Intensive)
app.get('/balance', authenticateToken, (req, res) => {
    // TRIGGER: Simulate load when checking balance
    simulateHeavyTask();

    const db = getDb();
    let account = db.accounts.find(acc => acc.userId === req.user.id);
    
    if (!account) {
        // Lazy Initialization (This is the ONLY place account is auto-created)
        account = { userId: req.user.id, balance: 1000 }; 
        db.accounts.push(account);
        console.log(`🆕 Created account for User ${req.user.id} with $1000 bonus`);
        saveDb(db);
    }
    
    res.json({ userId: req.user.id, balance: account.balance });
});

app.get('/status/:transactionId', authenticateToken, (req, res) => {
    const { transactionId } = req.params;
    const db = getDb();
    const transaction = db.transactions[transactionId];
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    res.json(transaction);
});

// Transfer Money (CPU Intensive)
app.post('/transfer', authenticateToken, async (req, res) => {
    // TRIGGER: Simulate load when transferring money
    simulateHeavyTask();

    const db = getDb();
    const { amount, recipientId } = req.body;
    const senderId = req.user.id;

    // Ensure sender has an account
    let senderAcc = db.accounts.find(acc => acc.userId === senderId);
    if (!senderAcc) {
        // Strict check: Do NOT auto-create account on transfer
        return res.status(404).json({ message: "Sender account not found. Please check balance to initialize account." });
    }

    if (senderAcc.balance < amount) {
        return res.status(400).json({ message: "Insufficient funds" });
    }

    // Optimistic Update
    senderAcc.balance -= amount;

    // Incremental Transaction ID
    const transactionId = (db.currentTransactionId++).toString();
    
    const transactionEvent = {
        transactionId,
        senderId,
        recipientId,
        amount,
        timestamp: new Date().toISOString(),
        status: "PENDING"
    };

    // Store in memory (DB)
    db.transactions[transactionId] = transactionEvent;
    
    // Save state to JSON file
    saveDb(db);

    if (channel) {
        channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(transactionEvent)));
        console.log(`📨 Event sent to queue: ${transactionId}`);
    }

    res.json({ 
        message: "Transaction processing", 
        status: "PENDING",
        transactionId 
    });
});

app.post('/transaction/update', async (req, res) => {
    const { transactionId, status } = req.body;
    const db = getDb();
    
    if (db.transactions[transactionId]) {
        db.transactions[transactionId].status = status;
        console.log(`🔄 Transaction ${transactionId} updated to ${status}`);
        
        // If rejected, refund the money
        if (status === 'REJECTED') {
            const tx = db.transactions[transactionId];
            const senderAcc = db.accounts.find(acc => acc.userId === tx.senderId);
            if (senderAcc) {
                senderAcc.balance += tx.amount;
                console.log(`↩️  Refunded ${tx.amount} to User ${tx.senderId}`);
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