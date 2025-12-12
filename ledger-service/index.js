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

// In-Memory Database
const accounts = [
    { userId: 1, balance: 1000 }, 
    { userId: 2, balance: 50000 } 
];
const transactionStore = {}; 

let channel;

// RabbitMQ Setup
async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_NAME, { durable: true });
        console.log("✅ Connected to RabbitMQ");
    } catch (error) {
        console.error("RabbitMQ Connection Error:", error);
        // Retry logic could go here
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

// UPDATED: Check Balance (Auto-creates account if missing)
app.get('/balance', authenticateToken, (req, res) => {
    let account = accounts.find(acc => acc.userId === req.user.id);
    
    if (!account) {
        // Lazy Initialization: Create account for new user
        account = { userId: req.user.id, balance: 1000 }; // Signup Bonus
        accounts.push(account);
        console.log(`🆕 Created account for User ${req.user.id} with $1000 bonus`);
    }
    
    res.json({ userId: req.user.id, balance: account.balance });
});

app.get('/status/:transactionId', authenticateToken, (req, res) => {
    const { transactionId } = req.params;
    const transaction = transactionStore[transactionId];
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    res.json(transaction);
});

app.post('/transfer', authenticateToken, async (req, res) => {
    const { amount, recipientId } = req.body;
    const senderId = req.user.id;

    // Ensure sender has an account
    let senderAcc = accounts.find(acc => acc.userId === senderId);
    if (!senderAcc) {
        // Auto-create if they try to transfer immediately after signup
        senderAcc = { userId: senderId, balance: 1000 };
        accounts.push(senderAcc);
    }

    if (senderAcc.balance < amount) {
        return res.status(400).json({ message: "Insufficient funds" });
    }

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

    transactionStore[transactionId] = transactionEvent;

    if (channel) {
        channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(transactionEvent)));
    }

    res.json({ 
        message: "Transaction processing", 
        status: "PENDING",
        transactionId 
    });
});

app.post('/transaction/update', async (req, res) => {
    const { transactionId, status } = req.body;
    if (transactionStore[transactionId]) {
        transactionStore[transactionId].status = status;
        console.log(`🔄 Transaction ${transactionId} updated to ${status}`);
        
        if (status === 'REJECTED') {
            const tx = transactionStore[transactionId];
            const senderAcc = accounts.find(acc => acc.userId === tx.senderId);
            if (senderAcc) senderAcc.balance += tx.amount;
        }
        return res.json({ success: true });
    }
    res.status(404).json({ error: "Transaction not found" });
});

app.listen(PORT, () => {
    console.log(`💰 Ledger Service running on port ${PORT}`);
});