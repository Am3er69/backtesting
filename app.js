// app.js
const { runBacktest } = require('./backtest');
const apiKey = '318e2543fba14c57836adc5ce228ee7e'; // your API key

async function main() {
  console.log('🚀 Starting backtest...');
  const result = await runBacktest(apiKey);

  if (result) {
    console.log(`Backtest Result: Wins=${result.wins}, Losses=${result.losses}`);
  }
}

main();
