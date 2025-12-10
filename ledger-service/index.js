const express = require('express');
const axios = require('axios');
const amqp = require('amqplib');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUE_NAME = 'transaction_events';

// Mock Data
const accounts = [
    { userId: 1, balance: 1000 }, 
    { userId: 2, balance: 50000 } // Updated: High balance to allow testing Fraud Rules (>9000)
];

// NEW: Store transactions here so we can update them later
// format: { "trans_id": { status: "PENDING", ... } }
const transactionStore = {}; 

let channel;

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

// --- AUTH MIDDLEWARE ---
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

app.get('/balance', authenticateToken, (req, res) => {
    const account = accounts.find(acc => acc.userId === req.user.id);
    if (!account) return res.status(404).json({ message: "Account not found" });
    res.json({ userId: req.user.id, balance: account.balance });
});

// NEW: Check Status Endpoint (User polls this)
app.get('/status/:transactionId', authenticateToken, (req, res) => {
    const { transactionId } = req.params;
    const transaction = transactionStore[transactionId];
    
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    res.json(transaction);
});

app.post('/transfer', authenticateToken, async (req, res) => {
    const { amount, recipientId } = req.body;
    const senderId = req.user.id;

    const senderAcc = accounts.find(acc => acc.userId === senderId);
    if (!senderAcc || senderAcc.balance < amount) {
        return res.status(400).json({ message: "Insufficient funds" });
    }

    // Optimistic Update
    senderAcc.balance -= amount;

    const transactionId = Math.floor(Math.random() * 100000).toString();
    const transactionEvent = {
        transactionId,
        senderId,
        recipientId,
        amount,
        timestamp: new Date().toISOString(),
        status: "PENDING"
    };

    // Store in memory
    transactionStore[transactionId] = transactionEvent;

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

// NEW: Internal Endpoint for Fraud Engine to call
// In production, this should be protected by a secret API key or internal network
app.post('/transaction/update', async (req, res) => {
    const { transactionId, status } = req.body;
    
    if (transactionStore[transactionId]) {
        transactionStore[transactionId].status = status;
        console.log(`🔄 Transaction ${transactionId} updated to ${status}`);
        
        // If rejected, refund the money (Simple compensation logic)
        if (status === 'REJECTED') {
            const tx = transactionStore[transactionId];
            const senderAcc = accounts.find(acc => acc.userId === tx.senderId);
            if (senderAcc) {
                senderAcc.balance += tx.amount;
                console.log(`↩️  Refunded ${tx.amount} to User ${tx.senderId}`);
            }
        }
        
        return res.json({ success: true });
    }
    // Comment
    res.status(404).json({ error: "Transaction not found" });
});

app.listen(PORT, () => {
    console.log(`💰 Ledger Service running on port ${PORT}`);
});
