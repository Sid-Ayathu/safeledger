const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const SECRET_KEY = "super_secret_safeledger_key"; // Move to .env later

app.use(express.json());

// Mock User Database
const users = [
    { id: 1, username: "admin", password: "password123", role: "admin" },
    { id: 2, username: "user", password: "password123", role: "customer" }
];

// Health Check
app.get('/health', (req, res) => {
    res.json({ service: 'Auth Service', status: 'Active' });
});

// Login Endpoint
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Simple authentication logic
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        // Generate JWT Token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            SECRET_KEY,
            { expiresIn: '1h' }
        );
        return res.json({ token });
    }

    res.status(401).json({ message: "Invalid credentials" });
});

// Verification Endpoint (for other services to check tokens)
app.post('/verify', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ valid: false });

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        res.json({ valid: true, user: decoded });
    } catch (err) {
        res.json({ valid: false });
    }
});

app.listen(PORT, () => {
    console.log(`🔐 Auth Service running on port ${PORT}`);
});