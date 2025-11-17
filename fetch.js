// fetch.js
require("dotenv").config();
const API_KEY = process.env.FINNHUB_API_KEY;

async function fetchCandles(symbol, timeframe = "1h", limit = 100) {
    try {
        // Convert timeframe to Finnhub resolution format
        const resolutionMap = {
            "1m": "1",
            "5m": "5",
            "15m": "15",
            "1h": "60",
            "4h": "240",
            "1d": "D"
        };

        const resolution = resolutionMap[timeframe] || "60";

        // Convert symbols for Finnhub
        const symbolMap = {
            "XAU/USD": "OANDA:XAU_USD",
            "EUR/USD": "OANDA:EUR_USD",
            "GBP/USD": "OANDA:GBP_USD",
            "USD/JPY": "OANDA:USD_JPY",
            "BTC/USD": "BINANCE:BTCUSDT",
            "ETH/USD": "BINANCE:ETHUSDT"
        };

        const finnhubSymbol = symbolMap[symbol];
        if (!finnhubSymbol) {
            console.log("Invalid symbol:", symbol);
            return [];
        }

        const now = Math.floor(Date.now() / 1000);
        const start = now - limit * 3600;

        const url =
            `https://finnhub.io/api/v1/forex/candle?symbol=${finnhubSymbol}` +
            `&resolution=${resolution}&from=${start}&to=${now}` +
            `&token=${API_KEY}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.s !== "ok") {
            console.log("Finnhub returned no data:", symbol);
            return [];
        }

        // Convert to unified candle format
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
