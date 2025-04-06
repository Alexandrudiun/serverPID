import express from 'express';
import bcrypt from 'bcrypt';
import { User, GameSession } from './models.js';
import addPlayerToAvailableGameSession from './functionsGameplay.js';
import genAI from './geminiClient.js'; // Import the geminiClient
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
            .populate('winner', 'email');
        
        res.status(200).json(gameSessions);
    } catch (error) {
        console.error('Error fetching game sessions:', error);
        res.status(500).json({ message: 'Error fetching game sessions', error: error.message });
    }
});

// Get a specific game session
router.get("/gamesessions/:id", async (req, res) => {
    try {
        const gameSession = await GameSession.findById(req.params.id);
        
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
        .populate('player2', 'email');
        
        res.status(200).json(gameSessions);
    } catch (error) {
        console.error('Error fetching user game sessions:', error);
        res.status(500).json({ message: 'Error fetching user game sessions', error: error.message });
    }
});
// Evaluate a player's word against a system word (both provided in request)
router.post("/evaluate-round/:id", async (req, res) => {
    try {
        const { userId, word, systemWord } = req.body;
        const { id } = req.params;

        if (!userId || !word || !systemWord) {
            return res.status(400).json({ message: 'User ID, player word, and system word are all required' });
        }

        // Basic validation - non-empty strings
        if (typeof word !== 'string' || word.trim().length === 0) {
            return res.status(400).json({ message: 'Invalid word. Please provide a non-empty word.' });
        }
        
        if (typeof systemWord !== 'string' || systemWord.trim().length === 0) {
            return res.status(400).json({ message: 'Invalid system word. Please provide a non-empty word.' });
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
        
        // If round doesn't exist yet, create it with the provided system word
        if (!currentRound) {
            gameSession.rounds.push({
                systemWord: systemWord,
                player1Move: null,
                player2Move: null,
                winner: null,
                explanation: null,
                roundNumber: gameSession.currentRound,
                timestamp: new Date()
            });
        } else if (!currentRound.systemWord) {
            // Update existing round with the provided system word
            currentRound.systemWord = systemWord;
        } else if (currentRound.systemWord !== systemWord) {
            // System word already exists but is different
            return res.status(400).json({ 
                message: 'A different system word is already set for this round',
                existingSystemWord: currentRound.systemWord 
            });
        }
        
        // Get the current round index
        const roundIndex = gameSession.rounds.findIndex(round => round.roundNumber === gameSession.currentRound);
        
        // Record the player's word
        const isPlayer1 = gameSession.player1.toString() === userId;
        
        if (isPlayer1) {
            if (gameSession.rounds[roundIndex].player1Move !== null) {
                return res.status(400).json({ message: 'You already made a move for this round' });
            }
            gameSession.rounds[roundIndex].player1Move = word;
        } else {
            if (gameSession.rounds[roundIndex].player2Move !== null) {
                return res.status(400).json({ message: 'You already made a move for this round' });
            }
            gameSession.rounds[roundIndex].player2Move = word;
        }
        
        // Check if the word is "timeout" (frontend handles the 15-second logic)
        const timeoutOccurred = word === "timeout";
        
        // Get the current player's word
        const playerWord = isPlayer1 ? 
            gameSession.rounds[roundIndex].player1Move : 
            gameSession.rounds[roundIndex].player2Move;
        
        // Evaluate the player's word against the system word
        let roundWinner = null;
        let explanation = '';
        
        try {
            // Use direct Gemini AI API call to compare the words semantically
            const apiKey = process.env.GEMINI_API_KEY;
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            
            const prompt = `You are judging a "Words of Power" battle.
                    
            System word: "${systemWord}"
            Player word: "${playerWord}"
            
            Determine if the player's word would win against the system word based on:
            1. Power level (which concept is more powerful)
            2. Elemental relationship (like fire beats ice)
            3. Logical dominance (like "shield" might beat "arrow")
            
            First, decide if the player wins, loses, or ties.
            Then provide a brief explanation (1-2 sentences).
            
            Return your answer in this exact format:
            RESULT: [win/lose/tie]
            EXPLANATION: [Your explanation]`;
            
            // Create request payload
            const payload = {
              contents: [
                {
                  parts: [{ text: prompt }]
                }
              ]
            };
        
            // Make POST request
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
              throw new Error(`Error fetching from API: ${response.status} ${response.statusText}`);
            }
        
            const data = await response.json();
            const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text.trim();
            
            // Parse the response
            const resultMatch = generatedText.match(/RESULT:\s*(win|lose|tie)/i);
            const explanationMatch = generatedText.match(/EXPLANATION:\s*(.+)$/is);
            
            if (resultMatch && explanationMatch) {
                const battleResult = resultMatch[1].toLowerCase();
                explanation = explanationMatch[1].trim();
                
                // Update round with result
                if (battleResult === 'win') {
                    roundWinner = isPlayer1 ? gameSession.player1 : gameSession.player2;
                    if (isPlayer1) {
                        gameSession.scores.player1 += 1;
                    } else {
                        gameSession.scores.player2 += 1;
                    }
                }
                // If result is 'lose' or 'tie', no winner is assigned
            } else {
                // Fallback if parsing fails
                const randomWin = Math.random() > 0.6; // 40% chance to win
                if (randomWin) {
                    roundWinner = isPlayer1 ? gameSession.player1 : gameSession.player2;
                    if (isPlayer1) {
                        gameSession.scores.player1 += 1;
                    } else {
                        gameSession.scores.player2 += 1;
                    }
                    explanation = `The word "${playerWord}" prevails over "${systemWord}" through mystical forces.`;
                } else {
                    explanation = `The word "${systemWord}" proves stronger than "${playerWord}" in this magical contest.`;
                }
            }
            
            gameSession.rounds[roundIndex].winner = roundWinner;
            gameSession.rounds[roundIndex].explanation = explanation;
            
        } catch (error) {
            console.error('Error evaluating words:', error);
            // Fallback evaluation
            const randomWin = Math.random() > 0.6; // 40% chance to win
            if (randomWin) {
                roundWinner = isPlayer1 ? gameSession.player1 : gameSession.player2;
                if (isPlayer1) {
                    gameSession.scores.player1 += 1;
                } else {
                    gameSession.scores.player2 += 1;
                }
                explanation = `The word "${playerWord}" prevails over "${systemWord}" through mystical forces.`;
            } else {
                explanation = `The word "${systemWord}" proves stronger than "${playerWord}" in this magical contest.`;
            }
            
            gameSession.rounds[roundIndex].winner = roundWinner;
            gameSession.rounds[roundIndex].explanation = explanation;
        }
        
        // Check if both players have submitted their words or if it's a timeout
        const bothPlayersSubmitted = 
            (gameSession.player2 === null) || // Single player mode
            (gameSession.rounds[roundIndex].player1Move !== null && 
             gameSession.rounds[roundIndex].player2Move !== null);
        
        if (bothPlayersSubmitted) {
            // Check if the game should end
            const maxRounds = gameSession.maxRounds;
            
            // Game ends if we've reached max rounds
            if (gameSession.currentRound >= maxRounds) {
                gameSession.status = 'completed';
                gameSession.endedAt = new Date();
                
                // Determine the game winner based on final score
                if (gameSession.scores.player1 > gameSession.scores.player2) {
                    gameSession.winner = gameSession.player1;
                } else if (gameSession.scores.player2 > gameSession.scores.player1) {
                    gameSession.winner = gameSession.player2;
                }
                // If scores are equal, winner remains null (it's a tie)
            } else {
                // Advance to next round
                gameSession.currentRound += 1;
                
                // Initialize next round
                gameSession.rounds.push({
                    systemWord: null,
                    player1Move: null,
                    player2Move: null,
                    winner: null,
                    explanation: null,
                    roundNumber: gameSession.currentRound,
                    timestamp: new Date()
                });
            }
        }
        
        await gameSession.save();
        
        // Generate response message
        let resultMessage = 'Word submitted';
        let roundResult = null;
        
        if (roundWinner) {
            const winnerIsUser = roundWinner.toString() === userId;
            if (winnerIsUser) {
                roundResult = 'win';
                resultMessage = 'Your word prevailed against the system word!';
            } else {
                roundResult = 'lose';
                resultMessage = 'Your word was defeated by the system word!';
            }
        } else {
            roundResult = 'tie';
            resultMessage = 'Your word matched evenly with the system word!';
        }
        
        if (timeoutOccurred) {
            resultMessage += ' The other player took too long to respond and forfeited this round.';
        }
        
        if (gameSession.status === 'completed') {
            if (gameSession.winner && gameSession.winner.toString() === userId) {
                resultMessage += ' You have mastered the Words of Power!';
            } else if (gameSession.winner) {
                resultMessage += ' You failed to master the Words of Power!';
            } else {
                resultMessage += ' Your journey with Words of Power has ended in balance.';
            }
        }
        
        res.status(200).json({
            message: resultMessage,
            explanation: explanation,
            roundResult,
            systemWord,
            playerWord,
            timeoutOccurred,
            currentRound: gameSession.currentRound,
            gameStatus: gameSession.status,
            scores: gameSession.scores,
            gameSession
        });
    } catch (error) {
        console.error('Error evaluating words:', error);
        res.status(500).json({ message: 'Error evaluating words', error: error.message });
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

router.post('/generate-words', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const prompt = `You're the System in a game called "Words of Power".
Your task is to generate 3 unique, powerful system words for 3 consecutive battle rounds.

Each system word should represent an object, force, or concept that can be challenged creatively.
Use only one word.
Respond in the following example JSON format:
{
  "rounds": [
     { "round": 1, "system_word": "Shield" },
     { "round": 2, "system_word": "Fire" },
     { "round": 3, "system_word": "Storm" }
  ]
}`;

    // Create request payload
    const payload = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    };

    // Make POST request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Error fetching from API: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Debug the response structure to see what we're getting
    console.log('Gemini API response:', JSON.stringify(data, null, 2));
    
    // Extract the generated text
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!generatedText) {
      throw new Error('No valid generated text received from Gemini API');
    }

    // Log the raw text before parsing
    console.log('Raw text before parsing:', generatedText);
    
    // Try to extract JSON from the text which might include markdown code blocks or other formatting
    let jsonText = generatedText;
    
    // If the text contains markdown JSON code blocks, extract just the JSON part
    if (generatedText.includes('```json')) {
      jsonText = generatedText.split('```json')[1].split('```')[0].trim();
    } else if (generatedText.includes('```')) {
      jsonText = generatedText.split('```')[1].split('```')[0].trim();
    }
    
    // Parse the extracted text as JSON
    const jsonResult = JSON.parse(jsonText);
    
    // Return the parsed JSON
    res.json(jsonResult);
  } catch (error) {
    console.error('Error generating words:', error);
    res.status(500).json({ 
      error: 'Failed to generate words', 
      details: error.message,
      stack: error.stack 
    });
  }
});
export default router;
