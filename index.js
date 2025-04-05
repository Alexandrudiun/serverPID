import express, { json, urlencoded } from 'express';
import cors from 'cors';
// import helmet from 'helmet';
// import rateLimit from 'express-rate-limit';
// import morgan from 'morgan';
// import compression from 'compression';
// import cookieParser from 'cookie-parser';
// import hpp from 'hpp';
// import xss from 'xss-clean';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables

const app = express();
const port = 3000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(json({ limit: '10kb' }));
app.use(urlencoded({ extended: true }));

// Error handling middleware for JSON parsing errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: 'Invalid JSON format' });
  }
  next(err);
});

app.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;

        // Simulate user login logic
        if (username === 'test' && password === 'test') {
            res.status(200).json({ message: 'Login successful' });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('Welcome to the home page!');
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});