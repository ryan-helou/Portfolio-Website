export const initialHoldings = [
  { symbol: "AAPL", shares: 2 },
  { symbol: "MSFT", shares: 1 },
];

export const mockQuote = {
  AAPL: { price: 230.12, prevClose: 227.84 },
  MSFT: { price: 420.55, prevClose: 418.1 },
};

export const mockSeries = {
  AAPL: Array.from({ length: 30 }, (_, i) => ({
    datetime: `2025-09-${String(i + 1).padStart(2, "0")}`,
    close: 220 + i * 0.4,
  })),
  MSFT: Array.from({ length: 30 }, (_, i) => ({
    datetime: `2025-09-${String(i + 1).padStart(2, "0")}`,
    close: 410 + i * 0.35,
  })),
};
