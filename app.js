// app.js
// Calls your deployed backend and prints the signal

const axios = require("axios");

// CHANGE THIS TO YOUR RENDER URL
const BACKEND_URL = "https://backtesting-vlun.onrender.com/backtest";

async function main() {
    try {
        console.log("🚀 Fetching live signal...");

        const symbol = "XAU/USD"; // default pair
        const response = await axios.get(`${BACKEND_URL}?symbol=${symbol}`);

        console.log("📡 Signal Response:");
        console.log(response.data);

    } catch (err) {
        console.log("❌ Error fetching signal:", err.message);
    }
}

main();
