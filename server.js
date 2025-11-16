const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs-extra");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = "318e2543fba14c57836adc5ce228ee7e";

async function fetchCandles(symbol, interval = "1h", limit = 100) {
    try {
        const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&apikey=${API_KEY}&outputsize=${limit}`;
        const response = await axios.get(url);
        if (response.data.status === "error") return null;
        return response.data.values.reverse();
    } catch (e) {
        console.log("Fetch error:", e.message);
        return null;
    }
}

function calculateSMA(candles, period) {
    const sma = [];
    for (let i = 0; i < candles.length; i++) {
        if (i < period) {
            sma.push(null);
            continue;
        }
        let sum = 0;
        for (let j = i - period; j < i; j++) {
            sum += parseFloat(candles[j].close);
        }
        sma.push(sum / period);
    }
    return sma;
}

function runBacktest(candles) {
    const sma = calculateSMA(candles, 14);
    let wins = 0;
    let losses = 0;

    for (let i = 15; i < candles.length; i++) {
        const price = parseFloat(candles[i].close);
        if (price > sma[i - 1]) wins++;
        else losses++;
    }

    return { wins, losses };
}

app.get("/backtest", async (req, res) => {
    const symbol = req.query.symbol || "XAU/USD";
    const candles = await fetchCandles(symbol, "1h", 200);

    if (!candles) {
        return res.json({ success: false, message: "Failed to load candles." });
    }

    const result = runBacktest(candles);
    res.json({
        success: true,
        symbol,
        total: candles.length,
        wins: result.wins,
        losses: result.losses,
        winrate: Number((result.wins / (result.wins + result.losses)) * 100).toFixed(2)
    });
});

app.listen(3000, () => {
    console.log("🚀 Local backend running: http://localhost:3000");
});
