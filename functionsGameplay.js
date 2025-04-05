import { User, GameSession } from './models.js';

/**
 * Adds a player to an available game session or creates a new one
 * @param {string} userId - The ID of the user to add
 * @returns {Object} The result of the operation
 */
async function addPlayerToAvailableGameSession(userId) {
    try {
        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Check if user is already in an active game
        const existingGame = await GameSession.findOne({
            $or: [
                { player1: userId, status: { $in: ['waiting', 'active'] } },
                { player2: userId, status: { $in: ['waiting', 'active'] } }
            ]
        });

        if (existingGame) {
            return {
                message: 'You are already in an active game session',
                gameSession: existingGame
            };
        }

        // Look for an available waiting game session
        const waitingSession = await GameSession.findOne({ 
            player2: null, 
            status: 'waiting',
            player1: { $ne: userId } // Ensure the user isn't playing against themselves
        });

        if (waitingSession) {
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
            
            return {
                message: 'Joined existing game session',
                gameSession: waitingSession
            };
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

        return { 
            message: 'New game session created successfully', 
            gameSession: newGameSession
        };
    } catch (error) {
        throw new Error(`Error adding player to game session: ${error.message}`);
    }
}

export default addPlayerToAvailableGameSession;