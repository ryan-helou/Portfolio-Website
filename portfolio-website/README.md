# Portfolio Tracker (Mock)

A minimal holdings tracker built with Vite + React. The current version uses mock data and a lightweight API layer that you can later replace with real Twelve Data endpoints.

## Getting Started

- `npm i`
- `npm run dev`

The UI persists holdings to `localStorage`, so changes survive a browser refresh.

## Swapping to the Twelve Data API

- Add a `.env` file in the project root with `VITE_TWELVEDATA_KEY=YOUR_KEY`.
- Update the fetch logic inside `src/api/twelve.js` to call the real `/quote` and `/time_series` endpoints using `import.meta.env.VITE_TWELVEDATA_KEY`.
- Remove or adjust the mock exports defined in `src/mock.js` once live data is wired up.
