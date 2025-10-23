export const initialHoldings = [];

export const mockQuote = {
  AAPL: { price: 230.12, prevClose: 227.84 },
  MSFT: { price: 420.55, prevClose: 418.1 },
  "AC.TO": { price: 24.50, prevClose: 24.30 },
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
  "AC.TO": Array.from({ length: 30 }, (_, i) => ({
    datetime: `2025-09-${String(i + 1).padStart(2, "0")}`,
    close: 23.5 + i * 0.05,
  })),
};
