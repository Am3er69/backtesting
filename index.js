// index.js
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

// 🟡 GENERATE SIGNALS ENDPOINT
app.get("/signals", async (req, res) => {
    try {
        const symbol = "OANDA:XAU_USD";  // 🔥 FIXED
        const timeframe = "1h";
        const limit = 200;

        const candles = await fetchCandles(symbol, timeframe, limit);

        if (!candles || candles.length === 0) {
            return res.json({
                success: false,
                message: "Failed to fetch candle data"
            });
        }

        // Run backtest
        const result = runBacktest(candles);

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

// ----------------------------------------------------
// 🔥 RATE-LIMIT SAFE FETCH SYSTEM
// ----------------------------------------------------

// FINNHUB-COMPATIBLE SYMBOLS
const symbols = [
    "OANDA:XAU_USD",
    "OANDA:EUR_USD",
    "OANDA:GBP_USD",
    "OANDA:USD_JPY",
    "BINANCE:BTCUSDT",
    "BINANCE:ETHUSDT"
];

// Safely rotate symbols to stay inside API limits
let symbolIndex = 0;

async function safeFetchLoop() {
    try {
        const symbol = symbols[symbolIndex];

        console.log(`⏳ Fetching: ${symbol}`);
        const candles = await fetchCandles(symbol, "1h", 100);

        if (!candles || candles.length === 0) {
            console.log(`⚠ No candle data for ${symbol}`);
        } else {
            console.log(`📊 Candle data OK for ${symbol}`);
        }

        symbolIndex = (symbolIndex + 1) % symbols.length;

    } catch (err) {
        console.log("Fetch loop error:", err);
    }
}

// Fetch ONE symbol every 15 seconds
setInterval(safeFetchLoop, 15000);

// ----------------------------------------------------
// 🟣 START SERVER
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 AI backend running on port ${PORT}`);
});
