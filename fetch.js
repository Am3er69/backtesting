// fetch.js
require("dotenv").config();
const API_KEY = process.env.FINNHUB_API_KEY;

async function fetchCandles(symbol, timeframe = "1h", limit = 100) {
    try {
        const resolutionMap = {
            "1m": "1",
            "5m": "5",
            "15m": "15",
            "1h": "60",
            "4h": "240",
            "1d": "D"
        };

        const resolution = resolutionMap[timeframe] || "60";

        // 🔥 We decide based on prefix of symbol
        let endpoint = "";
        if (symbol.startsWith("OANDA:")) {
            endpoint = "forex";
        } else if (symbol.startsWith("BINANCE:")) {
            endpoint = "crypto";
        } else {
            console.log("❌ Invalid Finnhub symbol format:", symbol);
            return [];
        }

        const now = Math.floor(Date.now() / 1000);
        const start = now - limit * 3600;

        // 🔥 Dynamically build API URL based on type
        const url =
            `https://finnhub.io/api/v1/${endpoint}/candle?` +
            `symbol=${symbol}` +
            `&resolution=${resolution}` +
            `&from=${start}&to=${now}` +
            `&token=${API_KEY}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.s !== "ok") {
            console.log("Finnhub returned no data:", symbol);
            return [];
        }

        const candles = data.t.map((t, i) => ({
            time: t * 1000,
            open: data.o[i],
            high: data.h[i],
            low: data.l[i],
            close: data.c[i]
        }));

        return candles;

    } catch (err) {
        console.error("fetchCandles error:", err);
        return [];
    }
}

module.exports = { fetchCandles };
