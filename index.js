import express, { json, urlencoded } from 'express';

const app = express();
const port = 3000;

const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const xss = require('xss-clean');
const dotenv = require('dotenv');

// Middleware
app.use(cors({ origin: '*' }));
app.use(json());
app.use(urlencoded({ extended: true }));



app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Simulate user login logic
    if (username === 'test' && password === 'test') {
        res.status(200).json({ message: 'Login successful' });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
}
);
app.use(json());
app.use(urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('Welcome to the home page!');
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});