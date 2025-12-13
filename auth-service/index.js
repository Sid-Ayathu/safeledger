const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs'); // Library for secure password hashing
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const SECRET_KEY = "super_secret_safeledger_key";

const DB_DIR = path.join(__dirname, 'data');
// Ensure directory exists
if (!fs.existsSync(DB_DIR)){
    fs.mkdirSync(DB_DIR);
}
const DB_PATH = path.join(DB_DIR, 'users_db.json');

app.use(express.json());

// --- DATABASE HELPERS ---
function getDb() {
    if (!fs.existsSync(DB_PATH)) {
        // Initialize with default admin AND default user for load testing
        // We use hashSync here only for initialization convenience
        const defaultPasswordHash = bcrypt.hashSync("password123", 10);
        
        const initialData = [
            { 
                id: 1, 
                username: "admin", 
                password: defaultPasswordHash, 
                role: "admin" 
            },
            {
                id: 2,
                username: "user", 
                password: defaultPasswordHash,
                role: "customer"
            }
        ];
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDb(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

app.get('/health', (req, res) => {
    const users = getDb();
    res.json({ service: 'Auth Service', status: 'Active', userCount: users.length });
});

// REGISTRATION (Hashes Password)
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = getDb();
        
        if (users.find(u => u.username === username)) {
            return res.status(400).json({ message: "Username already exists" });
        }

        // ENCRYPTION STEP: Hash the password with a salt round of 10
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            id: users.length + 1,
            username,
            password: hashedPassword, // Store the hash, NOT the plain text
            role: "customer"
        };
        
        users.push(newUser);
        saveDb(users);
        
        console.log(`🆕 New User Registered: ${username} (ID: ${newUser.id})`);
        res.json({ message: "Registration successful", user: { id: newUser.id, username } });
    } catch (e) {
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// LOGIN (Verifies Hash)
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = getDb();
        
        const user = users.find(u => u.username === username);

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // ENCRYPTION STEP: Compare input password with stored hash
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            const token = jwt.sign(
                { id: user.id, username: user.username, role: user.role },
                SECRET_KEY,
                { expiresIn: '1h' }
            );
            return res.json({ token, id: user.id });
        }

        res.status(401).json({ message: "Invalid credentials" });
    } catch (e) {
        res.status(500).json({ message: "Internal Server Error" });
    }
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