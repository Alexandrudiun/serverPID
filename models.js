import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});
// Game Session Schema for Words of Power
const gameSessionSchema = new mongoose.Schema({
  id: {
      type: String,
      unique: true
  },
  player1: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
  },
  player2: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      default: null 
  },
  status: { 
      type: String, 
      enum: ['waiting', 'active', 'completed', 'abandoned'], 
      default: 'waiting' 
  },
  winner: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      default: null 
  },
  rounds: [{
    systemWord: {
        type: String,
        default: null
    },
    player1Move: { 
        type: String,
        default: null 
    },
    player2Move: { 
        type: String,
        default: null 
    },
    winner: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
    },
    explanation: {
        type: String,
        default: null
    },
    player1SubmitTime: {
        type: Date,
        default: null
    },
    player2SubmitTime: {
        type: Date, 
        default: null
    },
    roundNumber: Number,
    timestamp: { type: Date, default: Date.now }
}],
  currentRound: {
      type: Number,
      default: 1
  },
  maxRounds: {
      type: Number,
      default: 3  // Best of 3 by default
  },
  scores: {
      player1: {
          type: Number,
          default: 0
      },
      player2: {
          type: Number,
          default: 0
      }
  },
  createdAt: { type: Date, default: Date.now },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null }
});

// Pre-save hook to set id field equal to _id
gameSessionSchema.pre('save', function(next) {
    if (!this.id) {
        this.id = this._id.toString();
    }
    next();
});

// Create a virtual property to access id as a string
gameSessionSchema.virtual('sessionId').get(function() {
    return this._id.toString();
});

// Ensure virtuals are included when converting to JSON
gameSessionSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        ret.id = ret._id.toString();
        return ret;
    }
});

export const User = mongoose.model('User', userSchema);
export const GameSession = mongoose.model('GameSession', gameSessionSchema);
