// backtest.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// =============================
// CONFIG
// =============================
const API_KEY = process.env.TD_KEY || ""; // set this in .env or environment variables
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "cache");
fs.ensureDirSync(DATA_DIR);

// Trading pairs (forex + crypto)
const PAIRS = [
  "XAU/USD", "EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY",
  "EUR/JPY", "EUR/GBP", "GBP/AUD",
  "BTC/USD", "ETH/USD"
];

const HISTORY_FILE = path.join(__dirname, "trade-history.json");
if (!fs.pathExistsSync(HISTORY_FILE)) fs.writeJsonSync(HISTORY_FILE, []);

// pacing so we don't burn API credits
const API_DELAY_MS = 1000; // 1s between TF requests

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// =====================================================
// API Data Fetch (Twelve Data)
// =====================================================
async function fetchCandles(symbol, interval="1min", outputsize=50){
  if (!API_KEY) throw new Error("No TwelveData API key provided (set TD_KEY).");
  // simple file-cache per symbol/interval
  const cacheName = `${symbol.replace("/","_")}_${interval}_${outputsize}.json`;
  const cachePath = path.join(DATA_DIR, cacheName);
  try {
    if (fs.pathExistsSync(cachePath)) {
      const stat = await fs.stat(cachePath);
      const age = Date.now() - stat.mtimeMs;
      if (age < 60 * 1000) { // cached for 60s
        const raw = await fs.readFile(cachePath, "utf8");
        return JSON.parse(raw);
      }
    }
  } catch(e) { /* ignore caching errors */ }

  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&format=JSON&apikey=${API_KEY}`;
  try {
    const resp = await axios.get(url, { timeout: 10000 });
    if (!resp.data || !resp.data.values) {
      throw new Error("No values from TwelveData");
    }
    const vals = resp.data.values.map(v => ({
      time: v.datetime || v.timestamp,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close)
    }));
    // newest first in TD; keep newest-last convention in calc functions (we use oldest->newest when needed)
    await fs.writeFile(cachePath, JSON.stringify(vals), "utf8");
    await sleep(API_DELAY_MS);
    return vals;
  } catch (err) {
    console.warn("fetchCandles error:", symbol, err.message || err);
    // try to return cached if any
    try { if (fs.pathExistsSync(cachePath)) return JSON.parse(await fs.readFile(cachePath, "utf8")); } catch(e){}
    return null;
  }
}

// =====================================================
// INDICATORS
// (functions expect array newest-first: index 0 = newest, consistent with frontend earlier code)
// =====================================================
function SMA(values, length){
  if (!values || values.length < length) return null;
  // take last `length` from the end (oldest->newest), but our arrays are newest-first, so slice(0..)
  const slice = values.slice(0, length).map(x => parseFloat(x.close)).reverse();
  const sum = slice.reduce((a,b) => a + b, 0);
  return sum / length;
}
function RSIFromCloses(closes, period=14){
  if (!closes || closes.length <= period) return null;
  // closes: newest-first
  let gains = 0, losses = 0;
  for (let i=0;i<period;i++){
    const cur = closes[i];
    const prev = closes[i+1] || closes[i];
    const diff = cur - prev;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  const avgG = gains/period, avgL = losses/period;
  const rs = avgG / avgL;
  return 100 - (100/(1+rs));
}
function ATR(candles, period=14){
  if (!candles || candles.length <= period) return null;
  let sum = 0;
  for (let i=0;i<period;i++){
    const hi = candles[i].high;
    const lo = candles[i].low;
    const prevClose = (i+1 < candles.length) ? candles[i+1].close : candles[i].close;
    const tr = Math.max(hi-lo, Math.abs(hi-prevClose), Math.abs(lo-prevClose));
    sum += tr;
  }
  return sum / period;
}
function calcEMAFromCloses(closes, period){
  if (!closes || closes.length < period) return null;
  // closes newest-first -> reverse for oldest-first
  const rev = closes.slice().reverse();
  let ema = rev.slice(0,period).reduce((a,b)=>a+b,0)/period;
  const k = 2/(period+1);
  for (let i=period;i<rev.length;i++) ema = (rev[i] - ema) * k + ema;
  return ema;
}
function MACDFromCloses(closes, fast=12, slow=26, signal=9){
  const emaFast = calcEMAFromCloses(closes, fast);
  const emaSlow = calcEMAFromCloses(closes, slow);
  if (emaFast === null || emaSlow === null) return { macd:0, signal:0, hist:0 };
  const macd = emaFast - emaSlow;
  // build short macd series for signal estimation
  const macdSeries = [];
  for (let i=0;i<slow+signal && i<closes.length;i++){
    const window = closes.slice(i);
    const a = calcEMAFromCloses(window, fast); const b = calcEMAFromCloses(window, slow);
    macdSeries.push((a===null||b===null)?0:(a-b));
  }
  const sigLine = calcEMAFromCloses(macdSeries, signal) || 0;
  return { macd, signal: sigLine, hist: macd - sigLine };
}
function trendStrength(sma5, sma20){ return Math.abs(sma5 - sma20); }

// =====================================================
// LEARNING (very lightweight)
// =====================================================
function getLearningWeights(){
  try {
    const history = fs.readJsonSync(HISTORY_FILE);
    if (!history || history.length < 10) return { rsi:1, macd:1, trend:1 };
    const wins = history.filter(h => h.result === "win").length;
    const losses = history.length - wins;
    const ratio = wins / Math.max(1, losses);
    return {
      rsi: ratio > 1 ? 1.15 : 1,
      macd: ratio > 1.1 ? 1.2 : 1,
      trend: ratio > 1.2 ? 1.3 : 1
    };
  } catch(e){
    return { rsi:1, macd:1, trend:1 };
  }
}

// =====================================================
// SIGNAL BUILDING (single function)
// =====================================================
function buildSignal(candles, pair){
  try {
    if (!candles || candles.length < 20) return { valid:false, reason:"insufficient" };
    // closes array newest-first
    const closes = candles.map(c => c.close);
    const sma5 = SMA(candles, 5);
    const sma20 = SMA(candles, 20);
    const rsi = RSIFromCloses(closes, 14);
    const atr = ATR(candles, 14);
    const macd = MACDFromCloses(closes, 12, 26, 9);
    const ts = trendStrength(sma5 || 0, sma20 || 0);
    const weights = getLearningWeights();

    let score = 50;
    let signal = "NONE";

    if (sma5 !== null && sma20 !== null) {
      if (sma5 > sma20) { signal = "BUY"; score += 10 * weights.trend; }
      else if (sma5 < sma20) { signal = "SELL"; score += 10 * weights.trend; }
    }

    if (rsi !== null){
      if (rsi < 30 && signal === "BUY") score += 12 * weights.rsi;
      if (rsi > 70 && signal === "SELL") score += 12 * weights.rsi;
    }

    if ((signal === "BUY" && macd.hist > 0) || (signal === "SELL" && macd.hist < 0)) score += 12 * weights.macd;

    if (atr !== null){
      if (atr < 0.0005) score -= 5; // extremely low vol
      if (atr > 1) score -= 10;     // extremely high vol (e.g. crypto burst)
    }

    const last = candles[0].close;
    // entry near current price (intraday preference)
    const psize = pair.includes("JPY") ? 0.01 : (pair === "XAU/USD" ? 0.01 : 0.0001);
    const entry = last;
    const slPips = Math.max(8, Math.round((atr || 0) / (psize || 1) * 1.0));
    const slPrice = signal === "BUY" ? entry - slPips * psize : entry + slPips * psize;
    const tpPrice = signal === "BUY" ? entry + slPips * psize * 2.0 : entry - slPips * psize * 2.0;

    const confidence = Math.min(95, Math.max(0, Math.round(score)));

    return {
      valid:true,
      symbol: pair,
      direction: signal,
      confidence,
      entry,
      stopLoss: slPrice,
      tp1: tpPrice,
      tp2: null,
      tp3: null,
      timestamp: candles[0].time,
      meta: { sma5, sma20, rsi, atr, macd, trendStrength: ts }
    };
  } catch(e){
    console.error("buildSignal error", e);
    return { valid:false, reason:"error" };
  }
}

// =====================================================
// ROUTES
// =====================================================

// root -> simple status
app.get("/", (req,res) => res.send("Signal backend running. Use /signals or /backtest?symbol=PAIR"));

// /backtest (keeps your older route)
app.get("/backtest", async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error:"symbol required" });
  const candles = await fetchCandles(symbol, "1min", 50);
  if (!candles) return res.json({ error:"No data" });
  const sig = buildSignal(candles, symbol);
  return res.json({ symbol, ...sig });
});

// new /signals route used by frontend
app.get("/signals", async (req, res) => {
  try {
    const out = [];
    for (const p of PAIRS){
      try {
        const candles = await fetchCandles(p, "1min", 50);
        if (!candles || candles.length < 20) {
          out.push({ symbol: p, error: "no_data" });
          await sleep(API_DELAY_MS);
          continue;
        }
        const sig = buildSignal(candles, p);
        // normalize to frontend-friendly fields (and hide very weak signals, but client also filters)
        out.push({
          symbol: p,
          direction: sig.direction,
          confidence: sig.confidence,
          entry: sig.entry,
          stopLoss: sig.stopLoss,
          tp1: sig.tp1,
          tp2: sig.tp2,
          tp3: sig.tp3,
          timestamp: sig.timestamp
        });
      } catch (e){
        console.warn("per-pair error", p, e.message || e);
        out.push({ symbol: p, error: "err" });
      }
      await sleep(API_DELAY_MS);
    }
    res.json({ signals: out, meta: { count: out.length, generatedAt: new Date().toISOString() } });
  } catch (e){
    console.error("/signals error", e);
    res.status(500).json({ error:"server" });
  }
});

// small endpoint to accept a taken trade (used later)
app.post("/trade/taken", async (req, res) => {
  try {
    const body = req.body || {};
    const hist = fs.readJsonSync(HISTORY_FILE);
    hist.push(Object.assign({}, body, { takenAt: new Date().toISOString(), resolved: false }));
    fs.writeJsonSync(HISTORY_FILE, hist, { spaces:2 });
    return res.json({ ok:true });
  } catch(e){
    console.error("trade.taken error", e);
    return res.status(500).json({ ok:false });
  }
});

// =====================================================
// START
// =====================================================
app.listen(PORT, () => {
  console.log(`🚀 Signal backend running on http://localhost:${PORT} (PORT env: ${ !!process.env.PORT })`);
});
