import { mockQuote, mockSeries } from "../mock";

export async function fetchQuote(symbol) {
  const entry = mockQuote[symbol] || { price: 0, prevClose: 0 };
  return {
    price: entry.price ?? 0,
    previous_close: entry.prevClose ?? 0,
  };
}

export async function fetchSeries(symbol, interval = "1day", output = 30) {
  const series = mockSeries[symbol] || [];
  return {
    values: series.slice(0, output).map((point) => ({
      datetime: point.datetime,
      close: String(point.close),
    })),
  };
}

// To swap in the real Twelve Data API later:
// 1. Create a .env file in the project root with VITE_TWELVEDATA_KEY=YOUR_KEY
// 2. Use import.meta.env.VITE_TWELVEDATA_KEY when calling the official quote and time_series endpoints.
