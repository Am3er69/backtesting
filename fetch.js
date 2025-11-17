const axios = require("axios");

async function fetchCandles(symbol, interval = "1h", limit = 200) {
    try {
        const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=${limit}&apikey=${process.env.TWELVEDATA_API_KEY}`;

        const res = await axios.get(url);

        if (!res.data || !res.data.values) {
            console.log("❌ No values from TwelveData");
            return null;
        }

        return res.data.values.reverse().map(c => ({
            time: c.datetime,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close)
        }));

    } catch (err) {
        console.log("❌ Fetch error:", err.message);
        return null;
    }
}

module.exports = { fetchCandles };
