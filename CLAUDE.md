# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React-based portfolio tracker web application that allows users to track stock holdings with real-time market data. The application supports both TSX (Toronto Stock Exchange) and NYSE/NASDAQ stocks, with database persistence via Supabase.

## Development Commands

**Working Directory**: All commands should be run from `portfolio-website/` subdirectory.

```bash
cd portfolio-website

# Development server (starts on http://localhost:5173)
npm run dev

# Production build
npm run build

# Lint code
npm run lint

# Preview production build
npm run preview
```

## Environment Configuration

The application requires a `.env` file in the `portfolio-website/` directory with the following variables:

```env
# Stock data API keys (at least one required, mock data used as fallback)
VITE_FINNHUB_KEY=          # For NYSE/NASDAQ quotes (60 calls/min)
VITE_MARKETSTACK_KEY=      # For TSX quotes (100 calls/month)
VITE_ALPHAVANTAGE_KEY=     # Fallback provider (25 calls/day)

# Supabase credentials (optional - enables save/load portfolio feature)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

**Important**: All environment variables must be prefixed with `VITE_` to be accessible in the client-side code. The dev server must be restarted after changing `.env` values.

## Architecture

### Data Flow

1. **Quote Fetching** (`src/api/twelve.js`):
   - Smart provider selection based on stock exchange
   - TSX stocks (.TO suffix): Marketstack → Alpha Vantage fallback
   - NYSE/NASDAQ: Finnhub → Alpha Vantage fallback
   - Two-layer caching: in-memory Map + localStorage (24-hour TTL)
   - Symbol normalization (uppercase, trim) and URL encoding for compatibility

2. **State Management** (`src/App.jsx`):
   - React useState/useEffect hooks (no external state library)
   - Holdings stored in localStorage under key "portfolio-holdings"
   - Portfolio key stored in localStorage under "portfolio-key"
   - Theme preference stored in localStorage under "theme"
   - Selected symbol persists across refreshes

3. **Database Persistence** (`src/lib/supabase.js`):
   - Supabase PostgreSQL database for portfolio storage
   - Public read/write access (no authentication)
   - Portfolio keys are 3-20 alphanumeric characters
   - Confirmation modals for overwrite/create operations

### Key Components

- **App.jsx**: Main application logic, state management, quote fetching orchestration
- **HoldingsTable.jsx**: Displays portfolio holdings with prices, gains/losses, and daily changes
- **PortfolioKeyManager.jsx**: Save/load portfolio functionality with database integration
- **ConfirmModal.jsx**: Modal dialogs for user confirmations (overwrite, create new)
- **MetricsBar.jsx**: Portfolio value and daily change summary
- **ThemeToggle.jsx**: Dark/light theme switcher

### API Layer Design

The `src/api/twelve.js` module handles all external API interactions:

- **Provider Strategy**: Automatically selects optimal API provider based on stock exchange and availability
- **Rate Limit Awareness**: Respects different provider limits (Finnhub: 60/min, Marketstack: 100/month, Alpha Vantage: 25/day)
- **Graceful Degradation**: Falls back to cached data or mock data if all providers fail
- **Error State**: Exports `apiState` object with `lastError`, `lastErrorAt`, `invalidKey` for UI feedback
- **Symbol Encoding**: Uses `encodeURIComponent()` to support symbols with dots (e.g., "AC.TO")

### Supabase Database Schema

**Table**: `portfolios`
- `id` (uuid, primary key): Auto-generated unique identifier
- `key` (text, unique): User-defined portfolio key (3-20 alphanumeric chars)
- `holdings` (jsonb): Array of {symbol, shares} objects
- `created_at` (timestamptz): Portfolio creation timestamp
- `updated_at` (timestamptz): Last update timestamp (auto-updated via trigger)

Setup SQL: `portfolio-website/supabase-setup.sql`
Documentation: `portfolio-website/SUPABASE_SETUP.md`

### Styling

- CSS with custom properties (CSS variables) for theming
- Theme classes: `.theme-dark` and `.theme-light` applied to `<html>` element
- No CSS preprocessor or CSS-in-JS library
- Responsive design with mobile-first approach

## Important Implementation Details

### Quote Refresh Logic

- **Cooldown**: 1.5 second cooldown between refresh requests to prevent API spam
- **Cache Check**: Only fetches quotes if cache is stale (>24 hours)
- **Force Refresh**: User can force refresh to bypass cache
- **Loading State**: `isLoadingQuotes` prevents multiple concurrent refresh operations

### Symbol Normalization

Always normalize symbols before comparison:
```javascript
function normalizeSymbol(symbol) {
  return (symbol || "").toUpperCase().trim();
}
```

### Mock Data Fallback

If API keys are missing or all providers fail, the app falls back to mock data defined in `src/mock.js`. This ensures the app remains functional for development/demo purposes.

### LocalStorage Error Handling

All localStorage operations are wrapped in try-catch to handle quota exceeded errors and SSR compatibility:
```javascript
try {
  window.localStorage.setItem(key, value);
} catch (error) {
  console.warn("Failed to persist", error);
}
```

## Common Development Patterns

### Adding a New Holding

Holdings are validated before being added:
- Symbol must be non-empty after normalization
- Shares must be a finite positive number
- Duplicate symbols increment existing share count

### Adding New Components

Components should:
- Use functional components with hooks
- Accept props with clear PropTypes or JSDoc comments
- Handle loading/error states gracefully
- Use semantic HTML with proper ARIA labels

### Working with the API Layer

When adding support for new data providers:
1. Add new environment variable to `.env` and check in component
2. Implement fetch functions following pattern: `providerFetchQuote(sym)` and `providerFetchSeries(sym, output)`
3. Update `resolveQuote()` and `resolveSeries()` with provider selection logic
4. Handle provider-specific error messages and rate limits
5. Update documentation with new provider's rate limits

## Testing the Application

**Manual Testing Checklist**:
- Add holdings with various symbols (NYSE, NASDAQ, TSX)
- Verify quote refresh updates prices correctly
- Test save/load portfolio with various key formats
- Verify overwrite confirmation modal appears
- Test theme toggle persistence across refreshes
- Check responsive layout on mobile/tablet/desktop
- Verify error banners appear when API keys are missing
- Test with mock data (no API keys set)

## Deployment Notes

- Build output goes to `portfolio-website/dist/`
- Vite production builds are optimized and minified
- Environment variables must be set in hosting platform (e.g., Vercel, Netlify)
- Supabase credentials should be added as environment variables (not committed to git)
- The app is fully client-side (no server-side rendering)
