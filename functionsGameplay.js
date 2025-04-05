
import { User, GameSession } from './models.js';

async function addPlayerToAvailableGameSession(userId) {
    try {
        // Check if user exists
        const userExists = await User.findById(userId);
        if (!userExists) {
            throw new Error('User not found');
        }

        // Find an existing game session where either player1 or player2 is null
        const availableSession = await GameSession.findOne({
            $or: [{ player1: null }, { player2: null }],
            status: 'waiting'
        });

        if (!availableSession) {
            throw new Error('No available game sessions');
        }

        // Add the player to the session
        if (availableSession.player1 === null) {
            availableSession.player1 = userId;
        } else if (availableSession.player2 === null) {
            availableSession.player2 = userId;
            availableSession.status = 'active'; // Activate the session if both players are present
            availableSession.startedAt = new Date();
        }

        // Save the updated session
        await availableSession.save();

        return {
            message: 'Player added to game session successfully',
            gameSession: availableSession
        };
    } catch (error) {
        console.error('Error adding player to game session:', error);
        throw new Error(error.message);
    }
}

export default addPlayerToAvailableGameSession;