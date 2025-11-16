// =====================================================
// UPGRADED BACKEND SIGNAL ENGINE (v3)
// =====================================================

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs-extra");

const app = express();
app.use(cors());

// =============================
// CONFIG
// =============================
const API_KEY = process.env.TD_KEY;
const PORT = 3000;

// Trading pairs (forex + crypto)
const PAIRS = [
    "XAU/USD", "EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY",
    "EUR/JPY", "EUR/GBP", "GBP/AUD",
    "BTC/USD", "ETH/USD"
];

// Backtest / learning storage
const HISTORY_FILE = "trade-history.json";
if (!fs.existsSync(HISTORY_FILE)) fs.writeJsonSync(HISTORY_FILE, []);

// =====================================================
// API Data Fetch
// =====================================================
async function fetchCandles(symbol) {
    try {
        const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&apikey=${API_KEY}&outputsize=50`;
        const res = await axios.get(url);
        return res.data.values ? res.data.values.reverse() : null;
    } catch (err) {
        console.log("❌ Candle fetch error:", err.message);
        return null;
    }
}

// =====================================================
// INDICATORS
// =====================================================
function SMA(values, length) {
    if (values.length < length) return null;
    const slice = values.slice(-length);
    const sum = slice.reduce((a, b) => a + parseFloat(b.close), 0);
    return sum / length;
}

function RSI(candles, period = 14) {
    if (candles.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        diff > 0 ? gains += diff : losses -= diff;
    }
    const rs = gains / (losses === 0 ? 1 : losses);
    return 100 - 100 / (1 + rs);
}

function MACD(values) {
    const ema = (len) => {
        const k = 2 / (len + 1);
        let emaPrev = parseFloat(values[0].close);
        for (let i = 1; i < values.length; i++) {
            emaPrev = parseFloat(values[i].close) * k + emaPrev * (1 - k);
        }
        return emaPrev;
    };
    const fast = ema(12);
    const slow = ema(26);
    return fast - slow;
}

function ATR(values, len = 14) {
    if (values.length < len + 1) return null;
    let trTotal = 0;
    for (let i = values.length - len; i < values.length; i++) {
        const high = values[i].high;
        const low = values[i].low;
        const prevClose = values[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trTotal += tr;
    }
    return trTotal / len;
}

function trendStrength(sma5, sma20) {
    return Math.abs(sma5 - sma20);
}

// =====================================================
// LEARNING ENGINE (ADAPTS SIGNAL WEIGHTS)
// =====================================================
function getLearningWeights() {
    try {
        const history = fs.readJsonSync(HISTORY_FILE);
        if (history.length < 10) return { rsi: 1, macd: 1, trend: 1 };

        const wins = history.filter(h => h.result === "win").length;
        const losses = history.length - wins;
        const ratio = wins / Math.max(1, losses);

        return {
            rsi: ratio > 1 ? 1.2 : 1,
            macd: ratio > 1.1 ? 1.3 : 1,
            trend: ratio > 1.2 ? 1.5 : 1
        };
    } catch {
        return { rsi: 1, macd: 1, trend: 1 };
    }
}

// =====================================================
// MAIN SIGNAL GENERATOR
// =====================================================
function generateSignal(candles) {
    const sma5 = SMA(candles, 5);
    const sma20 = SMA(candles, 20);
    const rsi = RSI(candles);
    const macd = MACD(candles);
    const atr = ATR(candles);
    const ts = trendStrength(sma5, sma20);

    const weights = getLearningWeights();

    let score = 50;
    let signal = "NONE";
    const last = candles[candles.length - 1].close;

    // Trend logic
    if (sma5 > sma20) {
        signal = "BUY";
        score += 10 * weights.trend;
    } else if (sma5 < sma20) {
        signal = "SELL";
        score += 10 * weights.trend;
    }

    // RSI logic
    if (rsi < 30 && signal === "BUY") score += 12 * weights.rsi;
    if (rsi > 70 && signal === "SELL") score += 12 * weights.rsi;

    // MACD strength
    if ((signal === "BUY" && macd > 0) || (signal === "SELL" && macd < 0))
        score += 15 * weights.macd;

    // Volatility control (bad volatility reduces confidence)
    if (atr < 0.05) score -= 5;
    if (atr > 1) score -= 10;

    return {
        signal,
        confidence: Math.min(100, Math.max(0, Math.round(score))),
        price: last,
        sma5,
        sma20,
        rsi,
        macd,
        atr,
        trendStrength: ts
    };
}

// =====================================================
// BACKTEST ROUTE
// =====================================================
app.get("/backtest", async (req, res) => {
    const symbol = req.query.symbol;
    const candles = await fetchCandles(symbol);
    if (!candles) return res.json({ error: "No data" });

    const signal = generateSignal(candles);

    res.json({
        symbol,
        ...signal
    });
});

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, () => {
    console.log(`🚀 Upgraded backend running on http://localhost:${PORT}`);
});
