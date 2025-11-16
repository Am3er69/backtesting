// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { fetchCandles } = require("./fetch");
const { runBacktest } = require("./backtest");

const app = express();
app.use(cors());
app.use(express.json());

// 🟢 HEALTH CHECK
app.get("/", (req, res) => {
    res.send("AI Backend is Running ✔");
});

// 🟡 GENERATE SIGNALS ENDPOINT (this fixes your frontend)
app.get("/signals", async (req, res) => {
    try {
        const symbol = "XAU/USD";      // default symbol for gold
        const timeframe = "1h";        // you can later make this dynamic
        const limit = 200;

        const candles = await fetchCandles(symbol, timeframe, limit);

        if (!candles || candles.length === 0) {
            return res.json({
                success: false,
                message: "Failed to fetch candle data"
            });
        }

        // Run your existing backtest logic
        const result = runBacktest(candles);

        // Build a signal object that matches frontend format
        const lastClose = candles[candles.length - 1].close;
        const confidence =
            ((result.wins / (result.wins + result.losses)) * 100).toFixed(2);

        const signal = {
            symbol: symbol,
            direction: result.wins > result.losses ? "BUY" : "SELL",
            confidence: Number(confidence),
            entry: lastClose,
            stopLoss: lastClose * (result.wins > result.losses ? 0.995 : 1.005),
            tp1: lastClose * (result.wins > result.losses ? 1.002 : 0.998),
            tp2: lastClose * (result.wins > result.losses ? 1.004 : 0.996),
            tp3: lastClose * (result.wins > result.losses ? 1.006 : 0.994),
            timestamp: Date.now()
        };

        return res.json({
            success: true,
            signals: [signal]
        });

    } catch (err) {
        console.error("Signal generation error:", err);
        res.json({
            success: false,
            message: "Internal backend error",
            error: String(err)
        });
    }
});

// 🟣 START SERVER (Render uses process.env.PORT)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 AI backend running on port ${PORT}`);
});
