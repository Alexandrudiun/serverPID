import express from 'express';
import bcrypt from 'bcrypt';
import { User, GameSession } from './models.js';
import addPlayerToAvailableGameSession from './functionsGameplay.js';
const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find user in database
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // User authenticated successfully
        res.status(200).json({ 
            message: 'Login successful',
            user: {
                id: user._id,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.', error: error.message });
    }
});

router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'User already exists' });
        }

        // Create new user
        const newUser = new User({
            email,
            password
        });

        await newUser.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.', error: error.message });
    }
});

// Get all users (for testing purposes)
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({}, '-password'); // Exclude password field
        res.status(200).json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
});

// Get user by ID
router.get('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id, '-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
});

// Create or join a game session
router.post("/creategamesession", async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        // Check if user exists
        const userExists = await User.findById(userId);
        if (!userExists) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Look for an existing game session waiting for a second player
        const waitingSession = await GameSession.findOne({ player2: null, status: 'waiting' });

        if (waitingSession && waitingSession.player1.toString() !== userId) {
            // Join existing session as player2
            waitingSession.player2 = userId;
            waitingSession.status = 'active';
            waitingSession.startedAt = new Date();
            
            // Initialize first round
            waitingSession.rounds.push({
                player1Move: null,
                player2Move: null,
                winner: null,
                roundNumber: 1,
                timestamp: new Date()
            });
            
            await waitingSession.save();
            
            return res.status(200).json({
                message: 'Joined existing game session',
                gameSession: waitingSession
            });
        }

        // Create a new game session
        const newGameSession = new GameSession({
            player1: userId,
            player2: null,
            status: 'waiting',
            createdAt: new Date(),
            currentRound: 1,
            scores: {
                player1: 0,
                player2: 0
            }
        });

        await newGameSession.save();

        res.status(201).json({ 
            message: 'Game session created successfully', 
            gameSession: newGameSession
        });
    } catch (error) {
        console.error('Error creating game session:', error);
        res.status(500).json({ message: 'Error creating game session', error: error.message });
    }
});

// Get all game sessions
router.get("/gamesessions", async (req, res) => {
    try {
        const gameSessions = await GameSession.find()
            .populate('player1', 'email')
            .populate('player2', 'email')
            .populate('winner', 'email')
            .populate('currentTurn', 'email');
        
        res.status(200).json(gameSessions);
    } catch (error) {
        console.error('Error fetching game sessions:', error);
        res.status(500).json({ message: 'Error fetching game sessions', error: error.message });
    }
});

// Get a specific game session
router.get("/gamesessions/:id", async (req, res) => {
    try {
        const gameSession = await GameSession.findById(req.params.id)
            .populate('player1', 'email')
            .populate('player2', 'email')
            .populate('winner', 'email')
            .populate('currentTurn', 'email');
        
        if (!gameSession) {
            return res.status(404).json({ message: 'Game session not found' });
        }
        
        res.status(200).json(gameSession);
    } catch (error) {
        console.error('Error fetching game session:', error);
        res.status(500).json({ message: 'Error fetching game session', error: error.message });
    }
});

// Get user's active game sessions
router.get("/usergamesessions/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        
        const gameSessions = await GameSession.find({
            $or: [
                { player1: userId },
                { player2: userId }
            ],
            status: { $in: ['waiting', 'active'] }
        })
        .populate('player1', 'email')
        .populate('player2', 'email')
        .populate('currentTurn', 'email');
        
        res.status(200).json(gameSessions);
    } catch (error) {
        console.error('Error fetching user game sessions:', error);
        res.status(500).json({ message: 'Error fetching user game sessions', error: error.message });
    }
});

// Make a move in rock-paper-scissors
router.post("/gamesessions/:id/move", async (req, res) => {
    try {
        const { userId, move } = req.body;
        const { id } = req.params;

        if (!userId || !move) {
            return res.status(400).json({ message: 'User ID and move are required' });
        }

        if (!['rock', 'paper', 'scissors'].includes(move)) {
            return res.status(400).json({ message: 'Invalid move. Choose rock, paper, or scissors' });
        }

        const gameSession = await GameSession.findById(id);
        
        if (!gameSession) {
            return res.status(404).json({ message: 'Game session not found' });
        }
        
        if (gameSession.status !== 'active') {
            return res.status(400).json({ message: 'Game is not active' });
        }
        
        if (gameSession.player1.toString() !== userId && gameSession.player2.toString() !== userId) {
            return res.status(403).json({ message: 'You are not a participant in this game' });
        }

        // Find the current round
        const currentRound = gameSession.rounds.find(round => round.roundNumber === gameSession.currentRound);
        
        // If round doesn't exist yet, create it
        if (!currentRound) {
            gameSession.rounds.push({
                player1Move: null,
                player2Move: null,
                winner: null,
                roundNumber: gameSession.currentRound,
                timestamp: new Date()
            });
        }
        
        // Get the current round index
        const roundIndex = gameSession.rounds.findIndex(round => round.roundNumber === gameSession.currentRound);
        
        // Record the player's move
        const isPlayer1 = gameSession.player1.toString() === userId;
        
        if (isPlayer1) {
            if (gameSession.rounds[roundIndex].player1Move !== null) {
                return res.status(400).json({ message: 'You already made a move for this round' });
            }
            gameSession.rounds[roundIndex].player1Move = move;
        } else {
            if (gameSession.rounds[roundIndex].player2Move !== null) {
                return res.status(400).json({ message: 'You already made a move for this round' });
            }
            gameSession.rounds[roundIndex].player2Move = move;
        }
        
        // If both players made their moves, determine the round winner
        if (gameSession.rounds[roundIndex].player1Move && gameSession.rounds[roundIndex].player2Move) {
            const player1Move = gameSession.rounds[roundIndex].player1Move;
            const player2Move = gameSession.rounds[roundIndex].player2Move;
            
            // Determine round winner
            let roundWinner = null;
            
            if (player1Move === player2Move) {
                // It's a tie, no winner for this round
                roundWinner = null;
            } else if (
                (player1Move === 'rock' && player2Move === 'scissors') ||
                (player1Move === 'paper' && player2Move === 'rock') ||
                (player1Move === 'scissors' && player2Move === 'paper')
            ) {
                // Player 1 wins
                roundWinner = gameSession.player1;
                gameSession.scores.player1 += 1;
            } else {
                // Player 2 wins
                roundWinner = gameSession.player2;
                gameSession.scores.player2 += 1;
            }
            
            gameSession.rounds[roundIndex].winner = roundWinner;
            
            // Check if the game should end
            const player1Score = gameSession.scores.player1;
            const player2Score = gameSession.scores.player2;
            const maxRounds = gameSession.maxRounds;
            const totalPlayed = player1Score + player2Score;
            
            // Game ends if one player has more than half of max rounds
            // or if all rounds have been played
            if (player1Score > maxRounds / 2 || player2Score > maxRounds / 2 || totalPlayed >= maxRounds) {
                gameSession.status = 'completed';
                gameSession.endedAt = new Date();
                
                // Determine the game winner
                if (player1Score > player2Score) {
                    gameSession.winner = gameSession.player1;
                } else if (player2Score > player1Score) {
                    gameSession.winner = gameSession.player2;
                }
                // If scores are equal, winner remains null (it's a tie)
            } else {
                // Move to the next round
                gameSession.currentRound += 1;
                
                // Initialize next round
                gameSession.rounds.push({
                    player1Move: null,
                    player2Move: null,
                    winner: null,
                    roundNumber: gameSession.currentRound,
                    timestamp: new Date()
                });
            }
        }
        
        await gameSession.save();
        
        // Generate response message
        let resultMessage = 'Move recorded';
        let roundResult = null;
        
        if (gameSession.rounds[roundIndex].player1Move && gameSession.rounds[roundIndex].player2Move) {
            if (gameSession.rounds[roundIndex].winner) {
                const winnerIsUser = gameSession.rounds[roundIndex].winner.toString() === userId;
                roundResult = winnerIsUser ? 'win' : 'lose';
                resultMessage = winnerIsUser ? 'You won this round!' : 'You lost this round!';
            } else {
                roundResult = 'tie';
                resultMessage = 'This round is a tie!';
            }
            
            if (gameSession.status === 'completed') {
                if (gameSession.winner) {
                    const gameWinnerIsUser = gameSession.winner.toString() === userId;
                    resultMessage += gameWinnerIsUser ? ' You won the game!' : ' You lost the game!';
                } else {
                    resultMessage += ' The game ended in a tie!';
                }
            }
        }
        
        res.status(200).json({
            message: resultMessage,
            roundResult,
            currentRound: gameSession.currentRound,
            gameStatus: gameSession.status,
            scores: gameSession.scores,
            gameSession
        });
    } catch (error) {
        console.error('Error making move:', error);
        res.status(500).json({ message: 'Error making move', error: error.message });
    }
});

// Abandon a game
router.post("/gamesessions/:id/abandon", async (req, res) => {
    try {
        const { userId } = req.body;
        const { id } = req.params;

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const gameSession = await GameSession.findById(id);
        
        if (!gameSession) {
            return res.status(404).json({ message: 'Game session not found' });
        }
        
        if (gameSession.status !== 'active' && gameSession.status !== 'waiting') {
            return res.status(400).json({ message: 'Game is already completed or abandoned' });
        }
        
        if (
            gameSession.player1.toString() !== userId && 
            (gameSession.player2 === null || gameSession.player2.toString() !== userId)
        ) {
            return res.status(403).json({ message: 'You are not a participant in this game' });
        }
        
        // Set the other player as winner if the game was active
        if (gameSession.status === 'active') {
            gameSession.winner = gameSession.player1.toString() === userId 
                ? gameSession.player2 
                : gameSession.player1;
        }
        
        gameSession.status = 'abandoned';
        gameSession.endedAt = new Date();
        
        await gameSession.save();
        
        res.status(200).json({
            message: 'Game abandoned successfully',
            gameSession
        });
    } catch (error) {
        console.error('Error abandoning game:', error);
        res.status(500).json({ message: 'Error abandoning game', error: error.message });
    }
});

router.post('/reset', async (req, res) => {
    try {
        // Delete all game sessions
        await GameSession.deleteMany({});
        
        // Delete all users
        await User.deleteMany({});
        
        res.status(200).json({ 
            message: 'Database reset successful. All data has been deleted.' 
        });
    } catch (error) {
        console.error('Error resetting database:', error);
        res.status(500).json({ 
            message: 'Error resetting database', 
            error: error.message 
        });
    }
});

router.post('/addplayertogamesession', async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const result = await addPlayerToAvailableGameSession(userId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


export default router;