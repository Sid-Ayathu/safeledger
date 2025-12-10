const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Use Env Variable OR fallback to localhost (for local dev)
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const LEDGER_SERVICE_URL = process.env.LEDGER_SERVICE_URL || 'http://localhost:3002';

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'API Gateway is Running', timestamp: new Date() });
});

// Proxy Rules
// 1. Forward auth requests to Auth Service
app.use('/auth', createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/auth': '', // Remove /auth from the path when forwarding
    },
}));

// 2. Forward transaction requests to Ledger Service (We will build this later)
app.use('/transaction', createProxyMiddleware({
    target: LEDGER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/transaction': '',
    },
}));

app.listen(PORT, () => {
    console.log(`🛡️  API Gateway running on port ${PORT}`);
});
