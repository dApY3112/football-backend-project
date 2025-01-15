const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    competition: { type: String, required: true },
    season: { type: String, required: true },
    teams: {
        home: { type: String, required: true },
        away: { type: String, required: true }
    },
    score: {
        home: { type: Number, required: true },
        away: { type: Number, required: true }
    },
    location: { type: String, required: true },
    referees: [String],
    events: [
        {
            type: { type: String, enum: ['goal', 'assist', 'penalty', 'warning'], required: true },
            player: { type: String, required: true },
            team: { type: String, required: true },
            minute: { type: Number, required: true }
        }
    ],
    lineUp: {
        home: [String],
        away: [String]
    }

});

module.exports = mongoose.model('Match', matchSchema);
