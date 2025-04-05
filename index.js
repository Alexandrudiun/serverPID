const express = require('express');

const app = express();
const port = 3000;

app.post('/signup', (req, res) => {
    const { username, password } = req.body;

    // Simulate user registration logic
    if (username && password) {
        res.status(201).json({ message: 'User registered successfully' });
    } else {
        res.status(400).json({ message: 'Invalid input' });
    }
}
);
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('Welcome to the home page!');
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});