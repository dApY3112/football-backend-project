const axios = require('axios');

// Football API URL and API key (replace 'YOUR_API_KEY' with your actual key)
const API_URL = 'https://api.football-data.org/v4/matches';
require('dotenv').config();
const API_KEY = process.env.FOOTBALL_API_KEY;

const fetchMatchData = async (competitionId = 2001, seasonYear = 2024) => {
    try {
        const response = await axios.get(API_URL, {
            headers: {
                'X-Auth-Token': API_KEY
            },
            params: {
                competition: competitionId,  // For example: '2001' is for English Premier League
                season: seasonYear
            }
        });

        // Check if the API returns matches
        if (response.data && response.data.matches) {
            return response.data.matches;
        } else {
            throw new Error('No match data found');
        }
    } catch (error) {
        console.error('Error fetching match data:', error.message);
        return null;
    }
};

module.exports = { fetchMatchData };
