const express = require('express');
const Match = require('../models/match');
const { fetchMatchData } = require('../footballDataServices');
const router = express.Router();

// Add a new match
router.post('/', async (req, res) => {
    try {
        const match = new Match(req.body);
        await match.save();
        res.status(201).json({ message: 'Match added', match });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get all matches
router.get('/', async (req, res) => {
    try {
        const matches = await Match.find();
        res.json(matches);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get statistics (top scorers, penalties)
router.get('/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const filter = {};

        if (startDate) filter.date = { $gte: new Date(startDate) };
        if (endDate) filter.date = { ...filter.date, $lte: new Date(endDate) };

        const matches = await Match.find(filter);

        const stats = {
            players: {},
            teams: {},
            playerOfTheMatch: {},
            rankings: { topScorers: [], topAssistProviders: [] },
        };

        const cleanSheets = {};

        matches.forEach(match => {
            const { home, away } = match.teams;

            // Initialize team stats
            stats.teams[home] = stats.teams[home] || { wins: 0, losses: 0, draws: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 };
            stats.teams[away] = stats.teams[away] || { wins: 0, losses: 0, draws: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 };

            // Update team stats
            stats.teams[home].goalsFor += match.score.home;
            stats.teams[home].goalsAgainst += match.score.away;
            stats.teams[away].goalsFor += match.score.away;
            stats.teams[away].goalsAgainst += match.score.home;

            if (match.score.home > match.score.away) {
                stats.teams[home].wins++;
                stats.teams[away].losses++;
            } else if (match.score.home < match.score.away) {
                stats.teams[away].wins++;
                stats.teams[home].losses++;
            } else {
                stats.teams[home].draws++;
                stats.teams[away].draws++;
            }

            // Clean Sheets
            if (match.score.away === 0) stats.teams[home].cleanSheets++;
            if (match.score.home === 0) stats.teams[away].cleanSheets++;

            // Update player stats from events
            const playerScores = {};

            // Update playerScores based on new MVP criteria
            match.events.forEach(event => {
                const { type, player, team } = event;
                if (!player) return;

                stats.players[player] = stats.players[player] || { goals: 0, assists: 0, penalties: 0, warnings: 0, savedPenalties: 0, mvpCount: 0 };

                if (type === 'goal') {
                    stats.players[player].goals++;
                    playerScores[player] = (playerScores[player] || 0) + 2; // 2 points for goals
                }
                if (type === 'assist') {
                    stats.players[player].assists++;
                    playerScores[player] = (playerScores[player] || 0) + 1; // 1 point for assists
                }
                if (type === 'penalty') stats.players[player].penalties++;
                if (type === 'warning') stats.players[player].warnings++;
                if (type === 'penaltySaved') {
                    stats.players[player].savedPenalties++;
                    playerScores[player] = (playerScores[player] || 0) + 3; // 3 points for saving a penalty
                }
                if (type === 'warningAvoided') {
                    playerScores[player] = (playerScores[player] || 0) + 1; // 1 point for avoiding a warning
                }
            });

            // Determine Player of the Match (with new criteria)
            const mvp = Object.entries(playerScores).reduce((top, current) =>
                current[1] > (top[1] || 0) ? current : top, [null, 0])[0];

            if (mvp) {
                stats.players[mvp].mvpCount++;
                stats.playerOfTheMatch[match._id] = mvp;
            }
        });

        stats.rankings.topScorers = Object.entries(stats.players)
            .sort(([, a], [, b]) => b.goals - a.goals)
            .slice(0, 5)
            .map(([name, data]) => ({ name, goals: data.goals }));

        stats.rankings.topAssistProviders = Object.entries(stats.players)
            .sort(([, a], [, b]) => b.assists - a.assists)
            .slice(0, 5)
            .map(([name, data]) => ({ name, assists: data.assists }));

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/filter', async (req, res) => {
    try {
        // Extract query parameters
        const { team, location, startDate, endDate, page = 1, limit = 10 } = req.query;

        // Build the query object dynamically
        const query = {};
        if (team) {
            query['$or'] = [{ 'teams.home': team }, { 'teams.away': team }];
        }
        if (location) {
            query.location = location;
        }
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        // Fetch matches with pagination
        const matches = await Match.find(query)
            .skip((page - 1) * limit)
            .limit(Number(limit));

        // Total matches count for pagination metadata
        const totalMatches = await Match.countDocuments(query);

        res.json({
            matches,
            pagination: {
                totalMatches,
                currentPage: Number(page),
                totalPages: Math.ceil(totalMatches / limit),
                perPage: Number(limit),
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/import-matches', async (req, res) => {
    try {
        const matches = await fetchMatchData();
        
        if (matches && matches.length > 0) {
            // Map fetched data to our model format
            const matchDocuments = matches.map(match => ({
                date: new Date(match.utcDate),
                competition: match.competition.name,
                season: match.season.startDate,
                homeTeam: match.homeTeam.name,
                awayTeam: match.awayTeam.name,
                score: {
                    home: match.score.fullTime.homeTeam,
                    away: match.score.fullTime.awayTeam
                },
                events: match.scorers ? match.scorers.map(scorer => ({
                    type: 'goal',
                    player: scorer.player.name,
                    team: scorer.team.name
                })) : []
            }));

            // Insert the matches into MongoDB
            await Match.insertMany(matchDocuments);
            res.json({ message: 'Matches imported successfully!' });
        } else {
            res.status(404).json({ message: 'No matches found in the API response' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error importing match data', error: error.message });
    }
});


module.exports = router;
