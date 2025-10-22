# Portfolio Tracker

A minimal holdings tracker built with Vite + React. It ships with mock data but can fetch live quotes from Finnhub (with an optional Alpha Vantage fallback) without additional libraries.

## Getting Started

- `npm i`
- `npm run dev`

The UI persists holdings to `localStorage`, so changes survive a browser refresh.

## Live Market Data (Finnhub)
1. Copy `.env.example` to `.env`.
2. Paste your Finnhub token: `VITE_FINNHUB_KEY=YOUR_TOKEN`.
3. (Optional) Add `VITE_ALPHAVANTAGE_KEY` as a fallback.
4. With no key, the app will transparently use mock data.
5. TSX tickers (e.g., `AC.TO`) are supported.

## Live Data Keys
- Create `.env` from `.env.example`.
- Put `VITE_FINNHUB_KEY` (primary) and optionally `VITE_ALPHAVANTAGE_KEY` (fallback).
- App tries Finnhub first; on symbol failure/empty data it falls back to Alpha Vantage.
- TSX tickers (e.g., `AC.TO`) supported via fallback.
- With no keys, app uses mock data.

