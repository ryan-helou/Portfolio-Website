# 📈 Portfolio Tracker

*A React web app for tracking a stock portfolio in real time — add holdings, watch the day's gain or loss, and save the whole thing behind a shareable key.*

![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white) ![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

Enter a ticker and a share count and the app pulls a live quote, tallies your total portfolio value, and shows how much you're up or down on the day. It handles both US listings and the Toronto Stock Exchange: a symbol ending in `.TO` gets routed to a different data provider than an ordinary NYSE or NASDAQ ticker.

Quotes come from three free APIs, picked per symbol to stay inside each one's rate limit:

- Finnhub (60 calls/min) for NYSE and NASDAQ
- Marketstack (100 calls/month) for `.TO` stocks on the TSX
- Alpha Vantage (25 calls/day) as the fallback when either of those fails

To keep from burning through those quotas, every quote is cached in memory and in `localStorage` for 24 hours, and manual refreshes are throttled to about one every 1.5 seconds. With no API keys set at all, the app falls back to built-in mock data so it still runs.

Portfolios persist two ways. Your holdings and theme choice live in `localStorage`, so a reload keeps your list intact. You can also push the whole portfolio to a Supabase table under a short alphanumeric key of 3–20 characters — no account, no password. Anyone who enters that same key on any device loads the same holdings, which makes a portfolio easy to share but also means the key is the only thing guarding it.

Built with React 19 and Vite, entirely client-side, and deployed on Vercel.
