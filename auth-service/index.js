const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const SECRET_KEY = "super_secret_safeledger_key";

app.use(express.json());

// In-memory Database
// We start with the default admin/user, but allow adding more
const users = [
    { id: 1, username: "admin", password: "password123", role: "admin" },
    { id: 2, username: "user", password: "password123", role: "customer" }
];

app.get('/health', (req, res) => {
    res.json({ service: 'Auth Service', status: 'Active', users: users.length });
});

// NEW: Registration Endpoint
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ message: "Username already exists" });
    }

    const newUser = {
        id: users.length + 1,
        username,
        password,
        role: "customer"
    };
    
    users.push(newUser);
    console.log(`🆕 New User Registered: ${username} (ID: ${newUser.id})`);
    
    res.json({ message: "Registration successful", user: { id: newUser.id, username } });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            SECRET_KEY,
            { expiresIn: '1h' }
        );
        return res.json({ token, id: user.id });
    }

    res.status(401).json({ message: "Invalid credentials" });
});

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