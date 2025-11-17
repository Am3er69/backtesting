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

        // Proper Finnhub symbols
        const symbolMap = {
            // Commodities (like gold)
            "XAU/USD": { type: "forex", symbol: "OANDA:XAU_USD" },

            // Forex
            "EUR/USD": { type: "forex", symbol: "OANDA:EUR_USD" },
            "GBP/USD": { type: "forex", symbol: "OANDA:GBP_USD" },
            "USD/JPY": { type: "forex", symbol: "OANDA:USD_JPY" },

            // Crypto
            "BTC/USD": { type: "crypto", symbol: "BINANCE:BTCUSDT" },
            "ETH/USD": { type: "crypto", symbol: "BINANCE:ETHUSDT" }
        };

        const info = symbolMap[symbol];
        if (!info) {
            console.log("Invalid symbol:", symbol);
            return [];
        }

        const finnhubSymbol = info.symbol;

        const now = Math.floor(Date.now() / 1000);
        const start = now - limit * 3600;

        let url = "";

        // Choose correct endpoint
        if (info.type === "forex") {
            url =
                `https://finnhub.io/api/v1/forex/candle?symbol=${finnhubSymbol}` +
                `&resolution=${resolution}&from=${start}&to=${now}` +
                `&token=${API_KEY}`;
        } else if (info.type === "crypto") {
            url =
                `https://finnhub.io/api/v1/crypto/candle?symbol=${finnhubSymbol}` +
                `&resolution=${resolution}&from=${start}&to=${now}` +
                `&token=${API_KEY}`;
        }

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
